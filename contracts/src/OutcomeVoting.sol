// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal interface for the Audit contract's voted settlement
interface IAuditForVoting {
    function settleByVote(address genius, address idiot, int256 qualityScore) external;
    function earlyExitByVote(address genius, address idiot, int256 qualityScore) external;
}

/// @notice Minimal interface for the Account contract
interface IAccountForVoting {
    function getCurrentCycle(address genius, address idiot) external view returns (uint256);
    function isAuditReady(address genius, address idiot) external view returns (bool);
    function getSignalCount(address genius, address idiot) external view returns (uint256);
}

/// @title OutcomeVoting
/// @notice On-chain aggregate voting for signal outcomes.
///         Validators independently compute quality scores off-chain via MPC,
///         then vote on the aggregate result. When 2/3+ validators agree on the
///         same quality score, settlement is triggered automatically.
///
///         Individual purchase outcomes NEVER go on-chain. Only the aggregate
///         quality score (in USDC) reaches the chain, preventing retroactive
///         identification of real picks from on-chain data.
///
/// @dev Validator set is managed by the contract owner (maps to Bittensor
///      metagraph in production). Votes are per (genius, idiot, cycle) tuple.
///      Each validator can vote once per cycle. Finalization is automatic
///      when quorum is reached.
contract OutcomeVoting is Ownable, Pausable, ReentrancyGuard {
    // ─── Constants ──────────────────────────────────────────────

    /// @notice Quorum requirement: 2/3 of validators must agree
    uint256 public constant QUORUM_NUMERATOR = 2;
    uint256 public constant QUORUM_DENOMINATOR = 3;

    // ─── State ──────────────────────────────────────────────────

    /// @notice Audit contract reference
    IAuditForVoting public audit;

    /// @notice Account contract reference
    IAccountForVoting public account;

    /// @notice Set of registered validators
    mapping(address => bool) public isValidator;

    /// @notice Ordered list of validator addresses (for enumeration)
    address[] public validators;

    /// @notice Index+1 of each validator in the array (0 = not present)
    mapping(address => uint256) private _validatorIndex;

    /// @notice Whether a validator has voted on a specific cycle
    /// @dev Key: keccak256(genius, idiot, cycle)
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    /// @notice The quality score each validator voted for
    mapping(bytes32 => mapping(address => int256)) public votedScore;

    /// @notice Count of votes for each unique score value per cycle
    /// @dev cycleKey => scoreHash => vote count
    mapping(bytes32 => mapping(bytes32 => uint256)) public voteCounts;

    /// @notice Whether a cycle has been finalized (settlement triggered)
    mapping(bytes32 => bool) public finalized;

    /// @notice Pending early exit requests: cycleKey => requested
    mapping(bytes32 => bool) public earlyExitRequested;

    /// @notice Who requested the early exit
    mapping(bytes32 => address) public earlyExitRequestedBy;

    // ─── Events ─────────────────────────────────────────────────

    /// @notice Emitted when a validator submits their vote
    event VoteSubmitted(
        address indexed genius,
        address indexed idiot,
        uint256 cycle,
        address indexed validator,
        int256 qualityScore
    );

    /// @notice Emitted when quorum is reached and settlement is triggered
    event QuorumReached(
        address indexed genius,
        address indexed idiot,
        uint256 cycle,
        int256 qualityScore,
        uint256 votesFor,
        uint256 totalValidators
    );

    /// @notice Emitted when a validator is added or removed
    event ValidatorUpdated(address indexed validator, bool added);

    /// @notice Emitted when an early exit is requested
    event EarlyExitRequested(
        address indexed genius,
        address indexed idiot,
        uint256 cycle,
        address indexed requestedBy
    );

    // ─── Errors ─────────────────────────────────────────────────

    /// @notice Caller is not a registered validator
    error NotValidator(address caller);

    /// @notice Validator has already voted on this cycle
    error AlreadyVoted(address validator, bytes32 cycleKey);

    /// @notice Cycle has already been finalized
    error CycleAlreadyFinalized(bytes32 cycleKey);

    /// @notice Validator address is zero
    error ZeroAddress();

    /// @notice Validator already registered
    error ValidatorAlreadyRegistered(address validator);

    /// @notice Validator not registered
    error ValidatorNotRegistered(address validator);

    /// @notice Contract address not set
    error ContractNotSet(string name);

    /// @notice Not a party to the audit (for early exit requests)
    error NotPartyToAudit(address caller, address genius, address idiot);

    /// @notice Early exit already requested for this cycle
    error EarlyExitAlreadyRequested(bytes32 cycleKey);

    /// @notice No purchases in cycle
    error NoPurchases(address genius, address idiot);

    // ─── Constructor ────────────────────────────────────────────

    /// @param _owner Contract owner (manages validator set)
    constructor(address _owner) Ownable(_owner) {}

    // ─── Admin ──────────────────────────────────────────────────

    /// @notice Set the Audit contract reference
    /// @param _audit Audit contract address
    function setAudit(address _audit) external onlyOwner {
        if (_audit == address(0)) revert ZeroAddress();
        audit = IAuditForVoting(_audit);
    }

    /// @notice Set the Account contract reference
    /// @param _account Account contract address
    function setAccount(address _account) external onlyOwner {
        if (_account == address(0)) revert ZeroAddress();
        account = IAccountForVoting(_account);
    }

    /// @notice Register a new validator
    /// @param validator Address to register
    function addValidator(address validator) external onlyOwner {
        if (validator == address(0)) revert ZeroAddress();
        if (isValidator[validator]) revert ValidatorAlreadyRegistered(validator);

        isValidator[validator] = true;
        validators.push(validator);
        _validatorIndex[validator] = validators.length; // 1-indexed

        emit ValidatorUpdated(validator, true);
    }

    /// @notice Remove a validator
    /// @param validator Address to remove
    function removeValidator(address validator) external onlyOwner {
        if (!isValidator[validator]) revert ValidatorNotRegistered(validator);

        isValidator[validator] = false;

        // Swap-and-pop removal from array
        uint256 idx = _validatorIndex[validator] - 1; // Convert to 0-indexed
        uint256 lastIdx = validators.length - 1;

        if (idx != lastIdx) {
            address lastValidator = validators[lastIdx];
            validators[idx] = lastValidator;
            _validatorIndex[lastValidator] = idx + 1;
        }

        validators.pop();
        delete _validatorIndex[validator];

        emit ValidatorUpdated(validator, false);
    }

    // ─── Early Exit Requests ────────────────────────────────────

    /// @notice Request early exit for a Genius-Idiot pair before 10 signals.
    ///         Either party can request. Validators then vote on the score.
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    function requestEarlyExit(address genius, address idiot) external whenNotPaused {
        if (msg.sender != genius && msg.sender != idiot) {
            revert NotPartyToAudit(msg.sender, genius, idiot);
        }
        if (address(account) == address(0)) revert ContractNotSet("Account");

        uint256 signalCount = account.getSignalCount(genius, idiot);
        if (signalCount == 0) revert NoPurchases(genius, idiot);

        uint256 cycle = account.getCurrentCycle(genius, idiot);
        bytes32 cycleKey = _cycleKey(genius, idiot, cycle);

        if (finalized[cycleKey]) revert CycleAlreadyFinalized(cycleKey);
        if (earlyExitRequested[cycleKey]) revert EarlyExitAlreadyRequested(cycleKey);

        earlyExitRequested[cycleKey] = true;
        earlyExitRequestedBy[cycleKey] = msg.sender;

        emit EarlyExitRequested(genius, idiot, cycle, msg.sender);
    }

    // ─── Voting ─────────────────────────────────────────────────

    /// @notice Submit a vote for the aggregate quality score of a Genius-Idiot cycle.
    ///         Validators compute the score off-chain using MPC (checking real pick
    ///         outcomes without revealing which line is real) and submit their result.
    ///         When 2/3+ validators agree, settlement is triggered automatically.
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @param qualityScore The USDC-denominated quality score (6 decimals, can be negative)
    function submitVote(
        address genius,
        address idiot,
        int256 qualityScore
    ) external whenNotPaused nonReentrant {
        if (!isValidator[msg.sender]) revert NotValidator(msg.sender);
        if (address(audit) == address(0)) revert ContractNotSet("Audit");
        if (address(account) == address(0)) revert ContractNotSet("Account");

        uint256 cycle = account.getCurrentCycle(genius, idiot);
        bytes32 cycleKey = _cycleKey(genius, idiot, cycle);

        if (finalized[cycleKey]) revert CycleAlreadyFinalized(cycleKey);
        if (hasVoted[cycleKey][msg.sender]) revert AlreadyVoted(msg.sender, cycleKey);

        // Record vote
        hasVoted[cycleKey][msg.sender] = true;
        votedScore[cycleKey][msg.sender] = qualityScore;

        // Count matching votes
        bytes32 scoreHash = keccak256(abi.encode(qualityScore));
        uint256 newCount = voteCounts[cycleKey][scoreHash] + 1;
        voteCounts[cycleKey][scoreHash] = newCount;

        emit VoteSubmitted(genius, idiot, cycle, msg.sender, qualityScore);

        // Check quorum: ceil(validators.length * 2 / 3)
        uint256 totalValidators = validators.length;
        uint256 threshold = (totalValidators * QUORUM_NUMERATOR + QUORUM_DENOMINATOR - 1)
            / QUORUM_DENOMINATOR;

        if (newCount >= threshold) {
            finalized[cycleKey] = true;

            emit QuorumReached(genius, idiot, cycle, qualityScore, newCount, totalValidators);

            // Determine if this is a full cycle or early exit
            bool isEarlyExit = earlyExitRequested[cycleKey];

            if (isEarlyExit) {
                audit.earlyExitByVote(genius, idiot, qualityScore);
            } else {
                audit.settleByVote(genius, idiot, qualityScore);
            }
        }
    }

    // ─── View Functions ─────────────────────────────────────────

    /// @notice Get the number of registered validators
    /// @return count Number of active validators
    function validatorCount() external view returns (uint256 count) {
        return validators.length;
    }

    /// @notice Get the quorum threshold for the current validator set
    /// @return threshold Number of matching votes needed to finalize
    function quorumThreshold() external view returns (uint256 threshold) {
        return (validators.length * QUORUM_NUMERATOR + QUORUM_DENOMINATOR - 1)
            / QUORUM_DENOMINATOR;
    }

    /// @notice Check if a cycle has been finalized
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @param cycle The audit cycle number
    /// @return True if finalized
    function isCycleFinalized(address genius, address idiot, uint256 cycle)
        external
        view
        returns (bool)
    {
        return finalized[_cycleKey(genius, idiot, cycle)];
    }

    /// @notice Get the vote count for a specific score in a cycle
    /// @param genius The Genius address
    /// @param idiot The Idiot address
    /// @param cycle The audit cycle number
    /// @param qualityScore The score to count votes for
    /// @return count Number of validators who voted for this score
    function getVoteCount(
        address genius,
        address idiot,
        uint256 cycle,
        int256 qualityScore
    ) external view returns (uint256 count) {
        bytes32 cycleKey = _cycleKey(genius, idiot, cycle);
        bytes32 scoreHash = keccak256(abi.encode(qualityScore));
        return voteCounts[cycleKey][scoreHash];
    }

    // ─── Internal ───────────────────────────────────────────────

    /// @dev Compute the unique key for a Genius-Idiot-Cycle tuple
    function _cycleKey(address genius, address idiot, uint256 cycle)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(genius, idiot, cycle));
    }

    // ─── Emergency Pause ────────────────────────────────────────

    /// @notice Pause voting
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause voting
    function unpause() external onlyOwner {
        _unpause();
    }
}
