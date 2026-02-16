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
    uint256 constant r =
        21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;
    // Base field size
    uint256 constant q =
        21_888_242_871_839_275_222_246_405_745_257_275_088_696_311_157_297_823_662_689_037_894_645_226_208_583;

    // Verification Key data
    uint256 constant alphax =
        20_491_192_805_390_485_299_153_009_773_594_534_940_189_261_866_228_447_918_068_658_471_970_481_763_042;
    uint256 constant alphay =
        9_383_485_363_053_290_200_918_347_156_157_836_566_562_967_994_039_712_273_449_902_621_266_178_545_958;
    uint256 constant betax1 =
        4_252_822_878_758_300_859_123_897_981_450_591_353_533_073_413_197_771_768_651_442_665_752_259_397_132;
    uint256 constant betax2 =
        6_375_614_351_688_725_206_403_948_262_868_962_793_625_744_043_794_305_715_222_011_528_459_656_738_731;
    uint256 constant betay1 =
        21_847_035_105_528_745_403_288_232_691_147_584_728_191_162_732_299_865_338_377_159_692_350_059_136_679;
    uint256 constant betay2 =
        10_505_242_626_370_262_277_552_901_082_094_356_697_409_835_680_220_590_971_873_171_140_371_331_206_856;
    uint256 constant gammax1 =
        11_559_732_032_986_387_107_991_004_021_392_285_783_925_812_861_821_192_530_917_403_151_452_391_805_634;
    uint256 constant gammax2 =
        10_857_046_999_023_057_135_944_570_762_232_829_481_370_756_359_578_518_086_990_519_993_285_655_852_781;
    uint256 constant gammay1 =
        4_082_367_875_863_433_681_332_203_403_145_435_568_316_851_327_593_401_208_105_741_076_214_120_093_531;
    uint256 constant gammay2 =
        8_495_653_923_123_431_417_604_973_247_489_272_438_418_190_587_263_600_148_770_280_649_306_958_101_930;
    uint256 constant deltax1 =
        6_541_990_260_011_023_852_553_601_414_706_066_007_991_439_602_741_597_720_424_994_416_031_240_333_133;
    uint256 constant deltax2 =
        6_009_810_798_253_884_550_278_036_890_097_128_971_437_969_815_184_423_096_109_881_055_862_232_787_244;
    uint256 constant deltay1 =
        5_075_995_947_480_456_814_967_196_812_763_221_209_708_402_448_464_507_312_498_341_001_256_680_173_385;
    uint256 constant deltay2 =
        12_083_216_474_663_757_440_845_720_858_481_485_184_396_841_246_044_900_606_198_946_043_629_177_348_906;

    uint256 constant IC0x =
        6_865_276_432_124_477_510_029_382_245_856_481_476_974_673_424_095_152_482_130_024_392_628_669_124_266;
    uint256 constant IC0y =
        4_322_025_505_424_210_689_714_197_294_107_487_807_944_803_975_955_297_685_159_276_581_239_962_395_034;

    uint256 constant IC1x =
        18_011_946_373_893_740_038_595_491_449_884_565_620_089_286_700_711_486_326_430_816_139_876_996_488_654;
    uint256 constant IC1y =
        600_508_547_536_651_526_329_335_999_192_927_584_285_419_943_241_133_554_196_294_054_524_959_052_682;

    uint256 constant IC2x =
        13_673_865_580_251_371_592_190_209_732_102_093_678_260_070_398_446_120_446_248_121_932_465_473_295_031;
    uint256 constant IC2y =
        12_799_662_078_848_476_107_326_363_824_244_289_014_185_367_010_969_815_735_625_274_594_160_979_885_604;

    uint256 constant IC3x =
        20_982_900_849_721_008_631_164_351_112_822_029_509_796_810_357_771_779_898_289_257_704_497_237_822_045;
    uint256 constant IC3y =
        15_624_871_576_375_580_825_815_567_335_880_636_731_623_252_054_460_093_797_914_742_369_091_444_586_661;

    uint256 constant IC4x =
        3_372_098_007_287_591_565_549_721_770_460_462_598_814_804_941_959_906_764_193_129_364_979_625_551_066;
    uint256 constant IC4y =
        20_338_981_708_164_508_702_013_864_835_223_087_589_826_346_284_169_381_178_761_323_490_504_178_989_434;

    uint256 constant IC5x =
        17_247_488_692_746_827_365_694_340_050_685_426_874_315_112_575_688_785_207_367_043_376_331_215_342_535;
    uint256 constant IC5y =
        18_286_291_680_795_292_835_329_131_422_507_464_676_661_018_573_784_985_828_820_522_863_174_641_082_513;

    uint256 constant IC6x =
        20_623_332_110_424_857_608_446_714_842_643_565_357_387_163_328_575_572_733_033_833_022_184_171_246_304;
    uint256 constant IC6y =
        11_798_263_989_401_196_759_885_809_313_891_685_816_251_451_500_699_762_691_839_544_655_387_084_688_264;

    uint256 constant IC7x =
        14_444_123_887_268_314_244_407_221_309_479_492_219_876_180_080_568_725_414_895_692_793_071_907_663_004;
    uint256 constant IC7y =
        13_869_855_451_701_095_728_598_497_776_846_924_141_532_064_412_445_759_590_403_211_410_210_362_869_489;

    uint256 constant IC8x =
        9_194_414_965_102_560_585_956_611_703_247_065_872_709_727_304_256_440_835_672_476_996_364_985_221_697;
    uint256 constant IC8y =
        3_316_196_316_168_291_249_331_846_647_673_165_477_468_972_581_512_167_916_136_985_036_340_656_220_080;

    uint256 constant IC9x =
        15_598_022_013_286_314_303_020_239_827_745_814_954_558_212_667_692_015_801_442_209_156_992_284_983_027;
    uint256 constant IC9y =
        4_992_013_256_876_897_961_268_683_680_437_695_668_712_240_046_138_252_004_649_474_303_058_060_245_493;

    uint256 constant IC10x =
        6_972_729_559_978_389_812_821_732_124_308_474_194_757_489_814_072_847_511_901_810_947_877_825_379_291;
    uint256 constant IC10y =
        1_959_853_931_268_059_263_355_242_358_746_041_542_531_272_350_582_093_226_743_862_006_999_094_945_336;

    uint256 constant IC11x =
        15_170_429_821_175_667_265_772_795_100_261_222_752_487_075_656_050_590_925_113_177_664_629_342_118_748;
    uint256 constant IC11y =
        7_024_658_815_248_032_095_347_409_686_122_746_407_499_000_031_659_195_563_804_306_770_038_153_408_460;

    uint256 constant IC12x =
        1_494_359_646_315_382_381_565_073_082_416_708_794_476_642_788_259_626_137_439_116_910_387_307_040_498;
    uint256 constant IC12y =
        4_197_940_832_335_907_688_445_958_898_293_627_966_386_904_543_788_659_786_532_215_562_358_982_895_759;

    uint256 constant IC13x =
        18_294_728_794_484_785_357_101_464_258_343_610_111_832_396_428_713_807_279_957_768_418_525_528_867_437;
    uint256 constant IC13y =
        9_565_775_159_056_217_099_939_507_268_550_708_686_469_115_676_964_499_758_611_241_103_264_471_818_972;

    uint256 constant IC14x =
        21_315_270_635_743_852_171_869_483_407_916_537_842_340_315_647_161_535_875_120_713_433_689_245_186_982;
    uint256 constant IC14y =
        10_919_853_433_980_156_394_020_691_534_139_554_420_436_298_154_430_732_002_003_101_963_918_691_611_570;

    uint256 constant IC15x =
        10_702_953_684_421_676_996_378_546_190_203_416_815_432_550_278_516_568_459_342_020_527_957_752_588_931;
    uint256 constant IC15y =
        7_457_722_076_290_948_391_268_607_056_644_191_793_872_769_989_213_948_518_487_797_003_202_294_319_996;

    uint256 constant IC16x =
        9_490_579_589_826_598_865_253_771_315_720_137_938_146_409_217_220_498_547_044_564_709_751_573_533_015;
    uint256 constant IC16y =
        15_960_181_749_297_664_043_940_360_342_284_923_927_097_285_087_948_215_250_418_188_045_876_798_213_869;

    uint256 constant IC17x =
        14_375_428_298_777_052_956_661_401_135_576_881_289_619_699_300_902_991_248_285_893_720_197_257_933_224;
    uint256 constant IC17y =
        719_741_411_215_221_239_057_588_482_122_515_118_320_163_190_363_260_989_345_078_745_759_580_166_485;

    uint256 constant IC18x =
        3_402_564_845_185_110_429_126_855_598_473_684_382_126_286_389_267_108_026_981_199_990_848_274_832_351;
    uint256 constant IC18y =
        14_322_775_202_102_364_785_369_510_199_022_237_527_332_901_636_712_845_785_055_217_590_992_421_738_577;

    uint256 constant IC19x =
        5_861_003_650_984_209_834_213_556_104_848_937_754_977_082_570_862_306_323_542_202_171_747_839_220_712;
    uint256 constant IC19y =
        5_667_928_063_741_419_484_823_749_956_361_697_295_220_096_888_180_098_023_658_503_042_873_974_835_777;

    uint256 constant IC20x =
        12_703_849_237_511_048_455_930_562_817_475_088_888_341_526_040_028_224_400_788_578_716_224_547_082_006;
    uint256 constant IC20y =
        5_560_607_319_440_679_691_356_043_656_346_234_907_637_273_190_251_412_749_710_040_530_161_021_874_011;

    uint256 constant IC21x =
        7_649_827_674_243_147_487_692_780_630_093_721_896_349_805_965_132_064_553_235_549_373_810_821_924_311;
    uint256 constant IC21y =
        10_021_460_198_726_120_864_295_624_175_993_255_591_185_460_549_138_252_174_058_441_238_981_911_821_387;

    uint256 constant IC22x =
        6_589_931_623_257_663_294_938_596_255_651_075_325_545_548_949_498_036_739_666_360_079_926_797_782_622;
    uint256 constant IC22y =
        9_600_310_669_823_875_175_665_353_820_713_337_914_760_609_319_112_077_876_298_101_499_480_413_165_534;

    uint256 constant IC23x =
        42_643_125_221_677_841_940_595_941_175_244_505_340_014_067_837_835_129_204_467_678_819_627_201_257;
    uint256 constant IC23y =
        3_302_741_365_663_370_946_126_350_918_201_555_986_865_840_122_296_020_489_745_752_388_813_865_405_519;

    uint256 constant IC24x =
        11_079_920_455_342_021_250_113_967_724_106_538_851_975_883_456_107_698_950_480_182_412_217_651_692_662;
    uint256 constant IC24y =
        13_192_979_365_784_576_414_684_611_928_061_521_573_961_553_400_583_013_290_217_651_635_777_996_140_560;

    uint256 constant IC25x =
        11_092_088_900_290_145_410_886_604_094_487_118_728_695_450_289_428_757_869_575_102_064_329_624_272_589;
    uint256 constant IC25y =
        15_127_703_741_137_075_540_879_037_802_419_669_416_094_711_445_704_665_941_777_551_498_841_135_797_504;

    uint256 constant IC26x =
        1_490_866_915_838_112_062_901_509_312_023_548_002_487_287_002_518_113_027_409_113_570_125_198_817_867;
    uint256 constant IC26y =
        13_684_237_299_698_708_870_778_131_950_644_283_843_267_964_000_896_087_965_059_002_343_456_244_742_320;

    uint256 constant IC27x =
        16_267_730_160_971_950_561_996_170_301_978_407_642_179_308_531_814_367_908_531_386_210_885_208_034_739;
    uint256 constant IC27y =
        5_727_600_044_570_620_743_356_905_659_696_302_793_846_657_867_425_171_514_132_661_700_100_830_175_160;

    uint256 constant IC28x =
        17_645_034_970_983_194_806_881_548_765_262_288_052_898_992_734_399_019_424_116_281_848_343_778_408_228;
    uint256 constant IC28y =
        5_736_506_302_270_512_363_970_660_115_963_979_032_380_581_617_750_613_938_046_291_642_525_738_868_551;

    uint256 constant IC29x =
        13_585_438_911_585_449_770_354_988_445_374_959_264_876_343_887_998_903_633_026_314_351_922_001_854_172;
    uint256 constant IC29y =
        15_747_541_981_632_842_940_167_664_999_182_479_967_840_518_469_610_977_325_709_781_375_860_106_926_391;

    uint256 constant IC30x =
        8_021_284_146_029_224_007_339_720_257_525_767_344_895_841_972_717_638_300_495_752_199_827_101_417_029;
    uint256 constant IC30y =
        15_037_994_337_369_810_359_722_149_516_597_629_954_802_129_676_860_092_837_822_174_079_726_495_281_007;

    uint256 constant IC31x =
        4_385_724_696_776_734_784_675_167_671_627_709_153_452_772_311_099_100_328_753_814_743_252_606_140_819;
    uint256 constant IC31y =
        8_603_699_686_360_180_010_320_314_363_621_138_410_206_134_543_554_537_234_168_327_676_041_178_774_413;

    uint256 constant IC32x =
        13_391_099_402_939_165_893_817_784_533_239_682_206_566_565_320_310_376_727_453_475_345_039_716_268_228;
    uint256 constant IC32y =
        12_142_286_080_059_963_892_002_869_947_348_054_787_801_170_611_781_743_955_744_686_284_767_256_266_744;

    uint256 constant IC33x =
        2_499_618_692_108_611_628_415_031_607_114_068_525_350_118_951_233_828_374_053_718_926_722_006_044_207;
    uint256 constant IC33y =
        3_650_268_976_826_392_633_858_302_407_721_418_264_173_864_006_405_549_226_740_640_662_512_243_420_809;

    uint256 constant IC34x =
        8_364_559_492_952_930_327_867_313_612_913_800_335_258_742_555_923_419_895_710_377_965_385_343_446_168;
    uint256 constant IC34y =
        16_099_823_228_762_643_973_778_399_279_618_984_791_178_879_763_654_719_266_855_787_735_940_440_147_095;

    uint256 constant IC35x =
        13_416_779_986_085_602_598_610_009_579_418_928_110_882_769_520_180_299_657_223_461_154_768_298_919_365;
    uint256 constant IC35y =
        11_125_600_714_871_041_844_201_940_224_574_207_938_828_555_001_992_581_735_146_123_031_750_346_635_543;

    uint256 constant IC36x =
        2_693_453_527_441_578_241_343_900_356_234_874_713_039_825_853_957_173_763_046_715_606_645_785_446_784;
    uint256 constant IC36y =
        20_358_900_074_554_388_208_501_233_786_119_874_512_814_090_270_775_111_499_117_447_091_892_466_397_810;

    uint256 constant IC37x =
        6_610_159_513_461_963_844_754_881_218_119_901_007_055_002_810_295_594_999_815_897_336_702_908_858_247;
    uint256 constant IC37y =
        5_762_388_943_888_783_688_832_408_710_242_178_630_345_251_147_104_040_400_684_212_457_156_387_053_378;

    uint256 constant IC38x =
        9_834_395_797_407_699_321_011_707_475_641_867_792_902_159_659_838_182_115_619_045_248_325_485_470_412;
    uint256 constant IC38y =
        8_410_907_644_558_902_235_639_183_412_779_163_503_449_376_376_048_440_197_989_838_428_655_933_135_141;

    uint256 constant IC39x =
        2_851_552_971_026_224_439_182_540_058_540_608_827_061_447_031_909_441_354_909_963_250_856_484_527_425;
    uint256 constant IC39y =
        12_498_801_040_402_704_799_107_797_265_588_480_187_852_922_170_829_539_649_689_067_292_616_595_216_312;

    uint256 constant IC40x =
        12_547_808_122_055_685_316_928_788_737_864_388_653_776_284_616_576_588_872_501_926_391_342_236_718_634;
    uint256 constant IC40y =
        4_421_997_877_329_771_733_255_857_446_244_817_865_394_088_701_966_894_003_506_443_984_158_908_848_582;

    uint256 constant IC41x =
        16_484_373_004_270_507_548_292_939_423_123_605_417_488_375_718_989_178_836_142_642_173_498_174_200_976;
    uint256 constant IC41y =
        16_365_558_458_692_779_765_327_956_853_938_148_241_205_369_409_516_585_014_587_499_259_502_411_930_624;

    uint256 constant IC42x =
        16_079_730_205_853_917_159_890_202_295_566_547_119_056_672_756_254_819_234_066_430_679_145_996_724_298;
    uint256 constant IC42y =
        20_103_741_989_846_871_702_586_275_231_276_402_701_687_022_912_195_665_022_162_222_676_657_527_888_791;

    uint256 constant IC43x =
        9_996_271_467_437_198_536_594_497_586_450_143_206_814_201_471_857_750_261_069_307_424_827_811_758_269;
    uint256 constant IC43y =
        11_635_127_985_366_893_570_249_596_655_880_749_115_707_950_478_617_098_649_490_678_052_149_704_085_114;

    uint256 constant IC44x =
        15_218_596_871_593_119_529_938_042_276_416_324_845_855_651_428_882_868_618_140_080_652_683_162_112_796;
    uint256 constant IC44y =
        458_420_128_502_277_034_505_441_449_407_219_232_589_797_374_290_551_862_910_748_219_824_005_152_229;

    uint256 constant IC45x =
        19_399_567_060_127_600_862_444_298_627_703_697_898_838_057_986_090_547_877_419_103_751_352_844_448_364;
    uint256 constant IC45y =
        797_580_643_234_920_640_355_526_736_568_207_589_171_246_179_909_299_789_545_533_478_257_897_517_067;

    uint256 constant IC46x =
        8_192_129_248_142_049_286_337_628_119_196_916_830_979_288_668_640_513_296_525_607_110_230_867_525_354;
    uint256 constant IC46y =
        1_229_968_600_155_311_446_778_781_637_552_377_740_023_157_535_798_541_380_328_781_221_992_234_716_916;

    uint256 constant IC47x =
        9_928_728_038_345_587_594_205_744_769_136_531_007_963_919_452_670_091_874_227_978_919_241_987_861_117;
    uint256 constant IC47y =
        5_422_130_746_860_084_780_790_163_247_067_373_895_953_026_715_631_906_801_168_380_675_426_933_120_747;

    uint256 constant IC48x =
        20_717_679_436_489_774_781_715_898_321_848_338_903_939_710_354_683_446_084_463_046_453_483_734_743_866;
    uint256 constant IC48y =
        1_769_680_969_894_257_872_739_180_450_444_402_053_310_385_507_846_276_099_598_317_334_580_309_805_336;

    uint256 constant IC49x =
        6_966_869_460_356_971_250_804_503_978_837_599_538_314_060_519_553_265_089_276_947_503_946_137_013_026;
    uint256 constant IC49y =
        18_563_725_970_766_331_477_667_343_173_880_076_295_515_144_062_319_802_527_153_378_314_472_336_214_238;

    uint256 constant IC50x =
        184_216_360_206_333_800_503_221_423_065_096_357_220_515_019_754_500_534_837_681_345_100_581_399_281;
    uint256 constant IC50y =
        3_158_886_384_287_089_444_497_116_260_351_116_413_976_307_463_795_543_869_596_605_100_615_682_070_524;

    uint256 constant IC51x =
        15_177_551_144_138_793_318_300_327_627_744_307_698_995_225_299_227_977_830_479_904_919_522_687_570_841;
    uint256 constant IC51y =
        640_142_782_762_676_241_701_902_037_403_911_115_009_640_809_555_384_899_074_035_736_684_986_232_008;

    uint256 constant IC52x =
        10_210_751_096_586_442_251_183_511_080_465_734_021_134_426_996_353_723_202_189_868_497_759_973_493_160;
    uint256 constant IC52y =
        15_591_048_086_355_241_760_385_861_303_275_291_184_148_136_102_450_046_576_916_525_678_955_307_045_545;

    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[52] calldata _pubSignals
    ) public view returns (bool) {
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
