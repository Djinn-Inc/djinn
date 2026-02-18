// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16AuditVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 8831037221697428259764386111216863447066023284961513228256959375650372377138;
    uint256 constant deltax2 = 10143887502579558608700038158904033432591466858884728883559297758590649117613;
    uint256 constant deltay1 = 3659841855430896889568397928553812298210477341524559703301161995281885879318;
    uint256 constant deltay2 = 14368385879532399775267962069208571846122401984923753916303023953754366402167;

    
    uint256 constant IC0x = 5419890893496875378193896572697959923198681707079183844076331506836458456133;
    uint256 constant IC0y = 117560905920036185070529266505046386038692953523728530803665165630429632883;
    
    uint256 constant IC1x = 3093827133119988586884199992002086783238546504354715020846347054863867394309;
    uint256 constant IC1y = 18158774342067440484887722210514660453218388077306820763745736541076802356865;
    
    uint256 constant IC2x = 13220357124153289122161610893320969670496218162698733767720692486295533395097;
    uint256 constant IC2y = 11981185097727755521298916299315902442745638196658168122335146344923425455663;
    
    uint256 constant IC3x = 6563607785303518296415974988025294485735767512902453876339438510543261773184;
    uint256 constant IC3y = 5964091656591575213739161937234909545654940768076028950253654256881304424241;
    
    uint256 constant IC4x = 9374189533339285392778375043468480989997116553887214116700936801236265339912;
    uint256 constant IC4y = 9286914946686611479329469508172889651642412659911752890293425150580375977757;
    
    uint256 constant IC5x = 10913877710227549735004122086497436765989954048610364609610477004784387325331;
    uint256 constant IC5y = 11774195998457998268230066552987815840675652747076828718777961480249833523429;
    
    uint256 constant IC6x = 16005253503156328065668403007298231238409386906534130713651311897913961209890;
    uint256 constant IC6y = 10156182658212781360181770195087698765413896769663474127853584852605002025163;
    
    uint256 constant IC7x = 1848736125514631509519022861549799028596931320351568644952290861011998947898;
    uint256 constant IC7y = 19053906898883212962371578555660768882703972386144140407239755606344254628959;
    
    uint256 constant IC8x = 12792433395383817896447330119531666024493371959577290272450723884894407083443;
    uint256 constant IC8y = 10736792548293844469041626688199220238695820723314089618204813913725705772435;
    
    uint256 constant IC9x = 14872043578301996538610894923063030247323942103494655403117343809433191876172;
    uint256 constant IC9y = 16261516087054577951124159529586972604619807245726936984329319763940700711096;
    
    uint256 constant IC10x = 12505700646377448019983298480446883278518142673035170442853192999638225528035;
    uint256 constant IC10y = 7447778091600969609212567496120007586629107149808007853790691750610198838102;
    
    uint256 constant IC11x = 17633304431098991115231055495595070516028824721436542455730583480273947978;
    uint256 constant IC11y = 19259828790645182435724985236939928419849303792486072578493418500926042003770;
    
    uint256 constant IC12x = 11713332593919591653793003859150623647097535135733913272106799206878115063852;
    uint256 constant IC12y = 11382065756922396283315444255884764496981255733321489162489304940124606885877;
    
    uint256 constant IC13x = 5862591418084151741412079338238248275543210418070182694079642769379353040071;
    uint256 constant IC13y = 19142918604291837352579308632118402619706027483880584840630968961075395761845;
    
    uint256 constant IC14x = 3322716005938987654908311791106152375732570490606068966333057953098989710549;
    uint256 constant IC14y = 13650628785434957511435993268158845482408599762583899922828325103120263274381;
    
    uint256 constant IC15x = 7134327161024173922689349748119015899418544211954888230081005576766145355879;
    uint256 constant IC15y = 1517441019165824099388379943543644316060799117565877525701603249003297894731;
    
    uint256 constant IC16x = 18649875013679232401018697628518217825994933790269638237060052515749320639269;
    uint256 constant IC16y = 4728163023924326265592480706571262492425044603776290634054487854177257594437;
    
    uint256 constant IC17x = 2358735743482477584184981673960775617605245738846509542621596558816052695792;
    uint256 constant IC17y = 16616432309777118213818956763982084211426216637158081157693777720821223000454;
    
    uint256 constant IC18x = 18250902762981760050729489377678230142673290208146489925765941059404469639736;
    uint256 constant IC18y = 6178482693734491547971459214973707985347460185406044733646784085573726950101;
    
    uint256 constant IC19x = 15521133599547107917682348889777843390866041492473058047374264522153922712125;
    uint256 constant IC19y = 11953467616741200628930207252694579511424571885367131111389648478026764754757;
    
    uint256 constant IC20x = 16827287757248212873491545054674718606290419945543783905539351757551021256199;
    uint256 constant IC20y = 3997191145735180367529591936646027386714918489907427915359724687772143575403;
    
    uint256 constant IC21x = 13578860522682551547548386053835500699960777307755220578307378362906308514305;
    uint256 constant IC21y = 479307927612692181567734072704709433026770688902159216779318563150343444298;
    
    uint256 constant IC22x = 12318692996521660045268264665951958130749846306903016024559043666777550633375;
    uint256 constant IC22y = 10723109857563475003493555605613014002083207836298417976378331595053689089820;
    
    uint256 constant IC23x = 12795103350342068568321320265249570564623848791117503688509260284652267076030;
    uint256 constant IC23y = 14699447685584560702067875948525107199265309875052050791345598896097663093805;
    
    uint256 constant IC24x = 6280738537834848563798608352942711526174106456059325697652660732352509462652;
    uint256 constant IC24y = 5363581379866601082040203322128418545023937081375358159521172996948396822038;
    
    uint256 constant IC25x = 8385847666970691885902759066166538571438777660213352850739983664466969945283;
    uint256 constant IC25y = 17163848826539298645293493297034450252339276232329981747184348277860486939618;
    
    uint256 constant IC26x = 21093634527457013619498085166781985464884566395369670420869843039874820048452;
    uint256 constant IC26y = 360681307164294527845826350314794579901138462387539821112020795354189781308;
    
    uint256 constant IC27x = 12744439895039704872709201450193676524638998895322902003493674362148566248460;
    uint256 constant IC27y = 4929001437883063481551279120147053029640091574638435191106474290946228340753;
    
    uint256 constant IC28x = 8994635020647584804539329256219311005320976583329077082920008463603431560351;
    uint256 constant IC28y = 3680052676984749786945568505460650989233755028359404969783471432863575282426;
    
    uint256 constant IC29x = 9183546889263979277112864836475120536436838662852422930269735597297017939367;
    uint256 constant IC29y = 3211744198752057632673934461387872496165007920004266980776763979813081494175;
    
    uint256 constant IC30x = 20091949736419514010338139372037430034232282913297929279730966228677362236037;
    uint256 constant IC30y = 13014506333966006795463551900941977622629862547455804529179637428604638108761;
    
    uint256 constant IC31x = 20358212767524311373403807372353990476148547498626959732194979972232993808218;
    uint256 constant IC31y = 4424762395179572189204208836522401017622900250466390669776258328626985657777;
    
    uint256 constant IC32x = 5577391748626262418961190863469426831762722346997107863949913922176785978042;
    uint256 constant IC32y = 5415980147632217903152366501768658204974650358147594265996617691949032635578;
    
    uint256 constant IC33x = 619893074191804396243241096307037396087783633394188333949516845472428980946;
    uint256 constant IC33y = 14689093909810352228435033321378724056726441760533336653559925155208483731650;
    
    uint256 constant IC34x = 12900488771988909481145015144498319804549292847299387650259304012502848336506;
    uint256 constant IC34y = 3629000946529007282204783519275096877454252482674894085921079121080847481960;
    
    uint256 constant IC35x = 5554327958669844526588848598841820815693428591716782846609004099056450395892;
    uint256 constant IC35y = 7876748953259295538768463993404739934538114755411200225597489225328457638489;
    
    uint256 constant IC36x = 13848048296295441810277881084339605914266717117231187030394208249710149969683;
    uint256 constant IC36y = 5644631994533884016103666684143182558870402445536922035352414840156500529557;
    
    uint256 constant IC37x = 4961920724161546391122692158326315505253715265906622764587278694211026693140;
    uint256 constant IC37y = 6631204688490725575028752726394245154189817125383138839570567831786088717821;
    
    uint256 constant IC38x = 11049627393769043575251404296175175003242502034146118639209439962374613894258;
    uint256 constant IC38y = 10985784300786669603488584003334147111128200909875850303112010097649487182729;
    
    uint256 constant IC39x = 5297318487523521158612831353641182115142703376126789938303003033234473186353;
    uint256 constant IC39y = 18784939087966673813558937431775290257976494873221457600105253215135163099113;
    
    uint256 constant IC40x = 5485475868963323741734861066952537080811600844803393902581958107380585037437;
    uint256 constant IC40y = 16065293152154108106661701167580978244891444134956294133660570046687859447962;
    
    uint256 constant IC41x = 13792469716305000676400826320655372138503460244530432361641877074363816811510;
    uint256 constant IC41y = 19472115140477422811110355391712401513987586213318198656387586419389537364976;
    
    uint256 constant IC42x = 14043724325075599748744891286680813991730746364825477192207795204912168743256;
    uint256 constant IC42y = 18477394349839174973855658207892800700659690021071124006965607831088087075490;
    
    uint256 constant IC43x = 20203507208549739395590505000509486227602474308847871455180257651801260245464;
    uint256 constant IC43y = 6343051012016104998834868503551673661024109115202055975060850302106254337777;
    
    uint256 constant IC44x = 4738101797413930736314899357015543738397326302025783467102031249641356241567;
    uint256 constant IC44y = 3087284719489590327449855186843645787499909516685062482714081277656645259516;
    
    uint256 constant IC45x = 8498730785185978087225627973535930922377910457806514830090580726398583598951;
    uint256 constant IC45y = 2098653527280307902128889506405997101870120530358221548246623016528303905184;
    
    uint256 constant IC46x = 10973572928025344088245804137312518176189896336071769563252617779665814191013;
    uint256 constant IC46y = 21571532308011433267164687447366229365662051435566700651213233650581948265741;
    
    uint256 constant IC47x = 7207367200612385214456275727151590562194204364346484860873006472608907442271;
    uint256 constant IC47y = 18816043217652106821464049879793575679811024356238597868378186901155257960566;
    
    uint256 constant IC48x = 6572614290025008389671377729063311338882670054530360830537453835658309147802;
    uint256 constant IC48y = 2260083580941689041594259366703378708406474983524775293207285557407119615201;
    
    uint256 constant IC49x = 12944200207979857713200365513440239227018901394384668342076875942836663544968;
    uint256 constant IC49y = 17491207687101784138875497507826272930397959400317216616653971844428198030510;
    
    uint256 constant IC50x = 15641886791206822644601720034098365736203322304464896370367291870981086501152;
    uint256 constant IC50y = 13572575015343791338308347823675016599306475031602993144411671865763568156244;
    
    uint256 constant IC51x = 6720219897686437507924455278746323975837169437097152994537380628612266622556;
    uint256 constant IC51y = 3245195843908465452787531991106009177725636874818500144678463150812026554597;
    
    uint256 constant IC52x = 7584931382961576455381799085231209749392510475262073268279641102786295700604;
    uint256 constant IC52y = 21180996356666936785381026637276121956965469686640528855121787481665093699888;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[52] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                
                g1_mulAccC(_pVk, IC22x, IC22y, calldataload(add(pubSignals, 672)))
                
                g1_mulAccC(_pVk, IC23x, IC23y, calldataload(add(pubSignals, 704)))
                
                g1_mulAccC(_pVk, IC24x, IC24y, calldataload(add(pubSignals, 736)))
                
                g1_mulAccC(_pVk, IC25x, IC25y, calldataload(add(pubSignals, 768)))
                
                g1_mulAccC(_pVk, IC26x, IC26y, calldataload(add(pubSignals, 800)))
                
                g1_mulAccC(_pVk, IC27x, IC27y, calldataload(add(pubSignals, 832)))
                
                g1_mulAccC(_pVk, IC28x, IC28y, calldataload(add(pubSignals, 864)))
                
                g1_mulAccC(_pVk, IC29x, IC29y, calldataload(add(pubSignals, 896)))
                
                g1_mulAccC(_pVk, IC30x, IC30y, calldataload(add(pubSignals, 928)))
                
                g1_mulAccC(_pVk, IC31x, IC31y, calldataload(add(pubSignals, 960)))
                
                g1_mulAccC(_pVk, IC32x, IC32y, calldataload(add(pubSignals, 992)))
                
                g1_mulAccC(_pVk, IC33x, IC33y, calldataload(add(pubSignals, 1024)))
                
                g1_mulAccC(_pVk, IC34x, IC34y, calldataload(add(pubSignals, 1056)))
                
                g1_mulAccC(_pVk, IC35x, IC35y, calldataload(add(pubSignals, 1088)))
                
                g1_mulAccC(_pVk, IC36x, IC36y, calldataload(add(pubSignals, 1120)))
                
                g1_mulAccC(_pVk, IC37x, IC37y, calldataload(add(pubSignals, 1152)))
                
                g1_mulAccC(_pVk, IC38x, IC38y, calldataload(add(pubSignals, 1184)))
                
                g1_mulAccC(_pVk, IC39x, IC39y, calldataload(add(pubSignals, 1216)))
                
                g1_mulAccC(_pVk, IC40x, IC40y, calldataload(add(pubSignals, 1248)))
                
                g1_mulAccC(_pVk, IC41x, IC41y, calldataload(add(pubSignals, 1280)))
                
                g1_mulAccC(_pVk, IC42x, IC42y, calldataload(add(pubSignals, 1312)))
                
                g1_mulAccC(_pVk, IC43x, IC43y, calldataload(add(pubSignals, 1344)))
                
                g1_mulAccC(_pVk, IC44x, IC44y, calldataload(add(pubSignals, 1376)))
                
                g1_mulAccC(_pVk, IC45x, IC45y, calldataload(add(pubSignals, 1408)))
                
                g1_mulAccC(_pVk, IC46x, IC46y, calldataload(add(pubSignals, 1440)))
                
                g1_mulAccC(_pVk, IC47x, IC47y, calldataload(add(pubSignals, 1472)))
                
                g1_mulAccC(_pVk, IC48x, IC48y, calldataload(add(pubSignals, 1504)))
                
                g1_mulAccC(_pVk, IC49x, IC49y, calldataload(add(pubSignals, 1536)))
                
                g1_mulAccC(_pVk, IC50x, IC50y, calldataload(add(pubSignals, 1568)))
                
                g1_mulAccC(_pVk, IC51x, IC51y, calldataload(add(pubSignals, 1600)))
                
                g1_mulAccC(_pVk, IC52x, IC52y, calldataload(add(pubSignals, 1632)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            
            checkField(calldataload(add(_pubSignals, 672)))
            
            checkField(calldataload(add(_pubSignals, 704)))
            
            checkField(calldataload(add(_pubSignals, 736)))
            
            checkField(calldataload(add(_pubSignals, 768)))
            
            checkField(calldataload(add(_pubSignals, 800)))
            
            checkField(calldataload(add(_pubSignals, 832)))
            
            checkField(calldataload(add(_pubSignals, 864)))
            
            checkField(calldataload(add(_pubSignals, 896)))
            
            checkField(calldataload(add(_pubSignals, 928)))
            
            checkField(calldataload(add(_pubSignals, 960)))
            
            checkField(calldataload(add(_pubSignals, 992)))
            
            checkField(calldataload(add(_pubSignals, 1024)))
            
            checkField(calldataload(add(_pubSignals, 1056)))
            
            checkField(calldataload(add(_pubSignals, 1088)))
            
            checkField(calldataload(add(_pubSignals, 1120)))
            
            checkField(calldataload(add(_pubSignals, 1152)))
            
            checkField(calldataload(add(_pubSignals, 1184)))
            
            checkField(calldataload(add(_pubSignals, 1216)))
            
            checkField(calldataload(add(_pubSignals, 1248)))
            
            checkField(calldataload(add(_pubSignals, 1280)))
            
            checkField(calldataload(add(_pubSignals, 1312)))
            
            checkField(calldataload(add(_pubSignals, 1344)))
            
            checkField(calldataload(add(_pubSignals, 1376)))
            
            checkField(calldataload(add(_pubSignals, 1408)))
            
            checkField(calldataload(add(_pubSignals, 1440)))
            
            checkField(calldataload(add(_pubSignals, 1472)))
            
            checkField(calldataload(add(_pubSignals, 1504)))
            
            checkField(calldataload(add(_pubSignals, 1536)))
            
            checkField(calldataload(add(_pubSignals, 1568)))
            
            checkField(calldataload(add(_pubSignals, 1600)))
            
            checkField(calldataload(add(_pubSignals, 1632)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
