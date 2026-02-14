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
    uint256 constant deltax1 = 19162742287070699485419400955927105302888364497357511548321302792529015790304;
    uint256 constant deltax2 = 16469397944787901809089093093662672236399082592007443153352189470099077354502;
    uint256 constant deltay1 = 5424626010919969848396950074021051995175600986135522810655792720680688361203;
    uint256 constant deltay2 = 19126937382265407886204894910276451492027183274115676341953442897075019345311;

    
    uint256 constant IC0x = 6865276432124477510029382245856481476974673424095152482130024392628669124266;
    uint256 constant IC0y = 4322025505424210689714197294107487807944803975955297685159276581239962395034;
    
    uint256 constant IC1x = 18011946373893740038595491449884565620089286700711486326430816139876996488654;
    uint256 constant IC1y = 600508547536651526329335999192927584285419943241133554196294054524959052682;
    
    uint256 constant IC2x = 13673865580251371592190209732102093678260070398446120446248121932465473295031;
    uint256 constant IC2y = 12799662078848476107326363824244289014185367010969815735625274594160979885604;
    
    uint256 constant IC3x = 20982900849721008631164351112822029509796810357771779898289257704497237822045;
    uint256 constant IC3y = 15624871576375580825815567335880636731623252054460093797914742369091444586661;
    
    uint256 constant IC4x = 3372098007287591565549721770460462598814804941959906764193129364979625551066;
    uint256 constant IC4y = 20338981708164508702013864835223087589826346284169381178761323490504178989434;
    
    uint256 constant IC5x = 17247488692746827365694340050685426874315112575688785207367043376331215342535;
    uint256 constant IC5y = 18286291680795292835329131422507464676661018573784985828820522863174641082513;
    
    uint256 constant IC6x = 20623332110424857608446714842643565357387163328575572733033833022184171246304;
    uint256 constant IC6y = 11798263989401196759885809313891685816251451500699762691839544655387084688264;
    
    uint256 constant IC7x = 14444123887268314244407221309479492219876180080568725414895692793071907663004;
    uint256 constant IC7y = 13869855451701095728598497776846924141532064412445759590403211410210362869489;
    
    uint256 constant IC8x = 9194414965102560585956611703247065872709727304256440835672476996364985221697;
    uint256 constant IC8y = 3316196316168291249331846647673165477468972581512167916136985036340656220080;
    
    uint256 constant IC9x = 15598022013286314303020239827745814954558212667692015801442209156992284983027;
    uint256 constant IC9y = 4992013256876897961268683680437695668712240046138252004649474303058060245493;
    
    uint256 constant IC10x = 6972729559978389812821732124308474194757489814072847511901810947877825379291;
    uint256 constant IC10y = 1959853931268059263355242358746041542531272350582093226743862006999094945336;
    
    uint256 constant IC11x = 15170429821175667265772795100261222752487075656050590925113177664629342118748;
    uint256 constant IC11y = 7024658815248032095347409686122746407499000031659195563804306770038153408460;
    
    uint256 constant IC12x = 1494359646315382381565073082416708794476642788259626137439116910387307040498;
    uint256 constant IC12y = 4197940832335907688445958898293627966386904543788659786532215562358982895759;
    
    uint256 constant IC13x = 18294728794484785357101464258343610111832396428713807279957768418525528867437;
    uint256 constant IC13y = 9565775159056217099939507268550708686469115676964499758611241103264471818972;
    
    uint256 constant IC14x = 21315270635743852171869483407916537842340315647161535875120713433689245186982;
    uint256 constant IC14y = 10919853433980156394020691534139554420436298154430732002003101963918691611570;
    
    uint256 constant IC15x = 10702953684421676996378546190203416815432550278516568459342020527957752588931;
    uint256 constant IC15y = 7457722076290948391268607056644191793872769989213948518487797003202294319996;
    
    uint256 constant IC16x = 9490579589826598865253771315720137938146409217220498547044564709751573533015;
    uint256 constant IC16y = 15960181749297664043940360342284923927097285087948215250418188045876798213869;
    
    uint256 constant IC17x = 14375428298777052956661401135576881289619699300902991248285893720197257933224;
    uint256 constant IC17y = 719741411215221239057588482122515118320163190363260989345078745759580166485;
    
    uint256 constant IC18x = 3402564845185110429126855598473684382126286389267108026981199990848274832351;
    uint256 constant IC18y = 14322775202102364785369510199022237527332901636712845785055217590992421738577;
    
    uint256 constant IC19x = 5861003650984209834213556104848937754977082570862306323542202171747839220712;
    uint256 constant IC19y = 5667928063741419484823749956361697295220096888180098023658503042873974835777;
    
    uint256 constant IC20x = 12703849237511048455930562817475088888341526040028224400788578716224547082006;
    uint256 constant IC20y = 5560607319440679691356043656346234907637273190251412749710040530161021874011;
    
    uint256 constant IC21x = 7649827674243147487692780630093721896349805965132064553235549373810821924311;
    uint256 constant IC21y = 10021460198726120864295624175993255591185460549138252174058441238981911821387;
    
    uint256 constant IC22x = 6589931623257663294938596255651075325545548949498036739666360079926797782622;
    uint256 constant IC22y = 9600310669823875175665353820713337914760609319112077876298101499480413165534;
    
    uint256 constant IC23x = 42643125221677841940595941175244505340014067837835129204467678819627201257;
    uint256 constant IC23y = 3302741365663370946126350918201555986865840122296020489745752388813865405519;
    
    uint256 constant IC24x = 11079920455342021250113967724106538851975883456107698950480182412217651692662;
    uint256 constant IC24y = 13192979365784576414684611928061521573961553400583013290217651635777996140560;
    
    uint256 constant IC25x = 11092088900290145410886604094487118728695450289428757869575102064329624272589;
    uint256 constant IC25y = 15127703741137075540879037802419669416094711445704665941777551498841135797504;
    
    uint256 constant IC26x = 1490866915838112062901509312023548002487287002518113027409113570125198817867;
    uint256 constant IC26y = 13684237299698708870778131950644283843267964000896087965059002343456244742320;
    
    uint256 constant IC27x = 16267730160971950561996170301978407642179308531814367908531386210885208034739;
    uint256 constant IC27y = 5727600044570620743356905659696302793846657867425171514132661700100830175160;
    
    uint256 constant IC28x = 17645034970983194806881548765262288052898992734399019424116281848343778408228;
    uint256 constant IC28y = 5736506302270512363970660115963979032380581617750613938046291642525738868551;
    
    uint256 constant IC29x = 13585438911585449770354988445374959264876343887998903633026314351922001854172;
    uint256 constant IC29y = 15747541981632842940167664999182479967840518469610977325709781375860106926391;
    
    uint256 constant IC30x = 8021284146029224007339720257525767344895841972717638300495752199827101417029;
    uint256 constant IC30y = 15037994337369810359722149516597629954802129676860092837822174079726495281007;
    
    uint256 constant IC31x = 4385724696776734784675167671627709153452772311099100328753814743252606140819;
    uint256 constant IC31y = 8603699686360180010320314363621138410206134543554537234168327676041178774413;
    
    uint256 constant IC32x = 13391099402939165893817784533239682206566565320310376727453475345039716268228;
    uint256 constant IC32y = 12142286080059963892002869947348054787801170611781743955744686284767256266744;
    
    uint256 constant IC33x = 2499618692108611628415031607114068525350118951233828374053718926722006044207;
    uint256 constant IC33y = 3650268976826392633858302407721418264173864006405549226740640662512243420809;
    
    uint256 constant IC34x = 8364559492952930327867313612913800335258742555923419895710377965385343446168;
    uint256 constant IC34y = 16099823228762643973778399279618984791178879763654719266855787735940440147095;
    
    uint256 constant IC35x = 13416779986085602598610009579418928110882769520180299657223461154768298919365;
    uint256 constant IC35y = 11125600714871041844201940224574207938828555001992581735146123031750346635543;
    
    uint256 constant IC36x = 2693453527441578241343900356234874713039825853957173763046715606645785446784;
    uint256 constant IC36y = 20358900074554388208501233786119874512814090270775111499117447091892466397810;
    
    uint256 constant IC37x = 6610159513461963844754881218119901007055002810295594999815897336702908858247;
    uint256 constant IC37y = 5762388943888783688832408710242178630345251147104040400684212457156387053378;
    
    uint256 constant IC38x = 9834395797407699321011707475641867792902159659838182115619045248325485470412;
    uint256 constant IC38y = 8410907644558902235639183412779163503449376376048440197989838428655933135141;
    
    uint256 constant IC39x = 2851552971026224439182540058540608827061447031909441354909963250856484527425;
    uint256 constant IC39y = 12498801040402704799107797265588480187852922170829539649689067292616595216312;
    
    uint256 constant IC40x = 12547808122055685316928788737864388653776284616576588872501926391342236718634;
    uint256 constant IC40y = 4421997877329771733255857446244817865394088701966894003506443984158908848582;
    
    uint256 constant IC41x = 16484373004270507548292939423123605417488375718989178836142642173498174200976;
    uint256 constant IC41y = 16365558458692779765327956853938148241205369409516585014587499259502411930624;
    
    uint256 constant IC42x = 16079730205853917159890202295566547119056672756254819234066430679145996724298;
    uint256 constant IC42y = 20103741989846871702586275231276402701687022912195665022162222676657527888791;
    
    uint256 constant IC43x = 9996271467437198536594497586450143206814201471857750261069307424827811758269;
    uint256 constant IC43y = 11635127985366893570249596655880749115707950478617098649490678052149704085114;
    
    uint256 constant IC44x = 15218596871593119529938042276416324845855651428882868618140080652683162112796;
    uint256 constant IC44y = 458420128502277034505441449407219232589797374290551862910748219824005152229;
    
    uint256 constant IC45x = 19399567060127600862444298627703697898838057986090547877419103751352844448364;
    uint256 constant IC45y = 797580643234920640355526736568207589171246179909299789545533478257897517067;
    
    uint256 constant IC46x = 8192129248142049286337628119196916830979288668640513296525607110230867525354;
    uint256 constant IC46y = 1229968600155311446778781637552377740023157535798541380328781221992234716916;
    
    uint256 constant IC47x = 9928728038345587594205744769136531007963919452670091874227978919241987861117;
    uint256 constant IC47y = 5422130746860084780790163247067373895953026715631906801168380675426933120747;
    
    uint256 constant IC48x = 20717679436489774781715898321848338903939710354683446084463046453483734743866;
    uint256 constant IC48y = 1769680969894257872739180450444402053310385507846276099598317334580309805336;
    
    uint256 constant IC49x = 6966869460356971250804503978837599538314060519553265089276947503946137013026;
    uint256 constant IC49y = 18563725970766331477667343173880076295515144062319802527153378314472336214238;
    
    uint256 constant IC50x = 184216360206333800503221423065096357220515019754500534837681345100581399281;
    uint256 constant IC50y = 3158886384287089444497116260351116413976307463795543869596605100615682070524;
    
    uint256 constant IC51x = 15177551144138793318300327627744307698995225299227977830479904919522687570841;
    uint256 constant IC51y = 640142782762676241701902037403911115009640809555384899074035736684986232008;
    
    uint256 constant IC52x = 10210751096586442251183511080465734021134426996353723202189868497759973493160;
    uint256 constant IC52y = 15591048086355241760385861303275291184148136102450046576916525678955307045545;
    
 
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
