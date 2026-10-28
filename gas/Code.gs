// マスマティック・ザ・ギャザリング を Google Apps Script の ウェブアプリとして ひらく
// ・ゲーム本体は index.html（node tools/build_gas.mjs で つくる 1ファイル版）
// ・データは この スクリプトが ついている スプレッドシートに おく（シートが なければ じどうで つくる）
//   せってい・かんりしゃ・ゴースト・デッキの点・ランキング・レイド・レイドゴースト・あいことば・あいことばの記録・ひきつぎ
// ・学内（ドメイン内）だけに 公開する。ひらいた 人の 学校アカウントで 先生（かんりしゃ）か どうかと、ひきつぎの もちぬしを 見わける
//   シートには 子どもの メールアドレスは 書かない（ひきつぎは 読めない 番号に かえて おく）
function doGet() {
  var g = game_(), out = null;
  if (g.html) out = HtmlService.createHtmlOutput(g.html);
  else {
    try { out = HtmlService.createHtmlOutputFromFile('index'); } catch (err) {
      // index.html を 上げて いない とき（エディタに Code.gs だけ）：とって ある ゲームを つかう（おなじ 版でも）
      var h = game_(true).html;
      if (!h) return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:24px">じゅんびちゅう です。先生は スクリプトの エディタで 関数 <b>mtgAdminUpdate</b> を 1回 実行して ください（GitHub から ゲームを とって きます）。</p>');
      out = HtmlService.createHtmlOutput(h);
    }
  }
  out.setTitle('マスマティック・ザ・ギャザリング')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  out.addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  try { out.addMetaTag('apple-mobile-web-app-capable', 'yes'); } catch (err) { /* なくても うごく */ }
  try { out.addMetaTag('apple-mobile-web-app-title', 'マスギャザ'); } catch (err) { /* なくても うごく */ }
  return out;
}

// カードの 点数と 色（build_gas.mjs が js/data/cards.js から 書きこむ）。デッキの チェックに つかう
// 「ゲームを 最新に する」で GitHub から とった ほうが 新しければ、そちらを つかう（cards_()）
var CARDS = {"W01":[1,"W"],"W02":[1,"W"],"W03":[1,"W"],"W04":[1,"W"],"W05":[1,"W"],"W06":[2,"W"],"W07":[2,"W"],"W08":[3,"W"],"W09":[4,"W"],"W10":[1,"W"],"W11":[1,"W"],"W12":[1,"W"],"W13":[1,"W"],"W14":[2,"W"],"W15":[2,"W"],"W16":[3,"W"],"W17":[1,"W"],"W18":[1,"W"],"W19":[1,"W"],"W20":[2,"W"],"W21":[2,"W"],"W22":[2,"W"],"W23":[3,"W"],"W24":[3,"W"],"W25":[3,"W"],"W26":[4,"W"],"U01":[1,"U"],"U02":[1,"U"],"U03":[1,"U"],"U04":[1,"U"],"U05":[2,"U"],"U06":[2,"U"],"U07":[3,"U"],"U08":[4,"U"],"U09":[1,"U"],"U10":[1,"U"],"U11":[1,"U"],"U12":[1,"U"],"U13":[2,"U"],"U14":[2,"U"],"U15":[2,"U"],"U16":[3,"U"],"U17":[4,"U"],"U18":[1,"U"],"U19":[1,"U"],"U20":[1,"U"],"U21":[1,"U"],"U22":[2,"U"],"U23":[2,"U"],"U24":[3,"U"],"U25":[3,"U"],"U26":[3,"U"],"G01":[1,"G"],"G02":[1,"G"],"G03":[1,"G"],"G04":[1,"G"],"G05":[1,"G"],"G06":[2,"G"],"G07":[2,"G"],"G08":[1,"G"],"G09":[1,"G"],"G10":[1,"G"],"G11":[1,"G"],"G12":[2,"G"],"G13":[2,"G"],"G14":[2,"G"],"G15":[3,"G"],"G16":[3,"G"],"G17":[4,"G"],"G18":[1,"G"],"G19":[1,"G"],"G20":[1,"G"],"G21":[2,"G"],"G22":[2,"G"],"G23":[3,"G"],"G24":[3,"G"],"G25":[3,"G"],"G26":[4,"G"],"R01":[1,"R"],"R02":[1,"R"],"R03":[1,"R"],"R04":[1,"R"],"R05":[2,"R"],"R06":[2,"R"],"R07":[3,"R"],"R08":[4,"R"],"R09":[1,"R"],"R10":[1,"R"],"R11":[1,"R"],"R12":[1,"R"],"R13":[2,"R"],"R14":[2,"R"],"R15":[2,"R"],"R16":[3,"R"],"R17":[3,"R"],"R18":[1,"R"],"R19":[1,"R"],"R20":[1,"R"],"R21":[1,"R"],"R22":[2,"R"],"R23":[2,"R"],"R24":[3,"R"],"R25":[3,"R"],"R26":[4,"R"],"WG01":[2,"WG"],"WG02":[3,"WG"],"WU01":[2,"WU"],"WU02":[3,"WU"],"RW01":[2,"RW"],"RW02":[3,"RW"],"UR01":[2,"UR"],"UR02":[3,"UR"],"RG01":[2,"RG"],"RG02":[3,"RG"],"GU01":[2,"GU"],"GU02":[3,"GU"],"C01":[1,""],"C02":[1,""],"C03":[1,""],"C04":[1,""],"C05":[2,""],"C06":[2,""],"C07":[2,""],"C08":[3,""],"C09":[3,""],"C10":[4,""],"W27":[1,"W"],"W28":[1,"W"],"W29":[1,"W"],"W30":[1,"W"],"W31":[1,"W"],"W32":[2,"W"],"W33":[2,"W"],"W34":[2,"W"],"W35":[3,"W"],"W36":[3,"W"],"W37":[4,"W"],"W38":[3,"W"],"W39":[3,"W"],"W40":[4,"W"],"U27":[1,"U"],"U28":[1,"U"],"U29":[1,"U"],"U30":[1,"U"],"U31":[1,"U"],"U32":[2,"U"],"U33":[2,"U"],"U34":[2,"U"],"U35":[3,"U"],"U36":[3,"U"],"U37":[4,"U"],"U38":[3,"U"],"U39":[3,"U"],"U40":[4,"U"],"G27":[1,"G"],"G28":[1,"G"],"G29":[1,"G"],"G30":[1,"G"],"G31":[1,"G"],"G32":[2,"G"],"G33":[2,"G"],"G34":[2,"G"],"G35":[3,"G"],"G36":[3,"G"],"G37":[4,"G"],"G38":[3,"G"],"G39":[3,"G"],"G40":[4,"G"],"R27":[1,"R"],"R28":[1,"R"],"R29":[1,"R"],"R30":[1,"R"],"R31":[1,"R"],"R32":[2,"R"],"R33":[2,"R"],"R34":[2,"R"],"R35":[3,"R"],"R36":[3,"R"],"R37":[4,"R"],"R38":[3,"R"],"R39":[3,"R"],"R40":[4,"R"],"WG03":[2,"WG"],"WG04":[3,"WG"],"WU03":[2,"WU"],"WU04":[3,"WU"],"RW03":[2,"RW"],"RW04":[3,"RW"],"UR03":[2,"UR"],"UR04":[3,"UR"],"RG03":[2,"RG"],"RG04":[3,"RG"],"GU03":[2,"GU"],"GU04":[3,"GU"],"C11":[1,""],"C12":[1,""],"C13":[2,""],"C14":[2,""],"C15":[3,""],"C16":[4,""],"K01":[1,"K"],"K02":[1,"K"],"K03":[1,"K"],"K04":[1,"K"],"K05":[1,"K"],"K06":[1,"K"],"K07":[1,"K"],"K08":[1,"K"],"K09":[1,"K"],"K10":[1,"K"],"K11":[1,"K"],"K12":[1,"K"],"K13":[1,"K"],"K14":[1,"K"],"K15":[1,"K"],"K16":[1,"K"],"K17":[1,"K"],"K18":[2,"K"],"K19":[2,"K"],"K20":[2,"K"],"K21":[2,"K"],"K22":[2,"K"],"K23":[2,"K"],"K24":[2,"K"],"K25":[2,"K"],"K26":[2,"K"],"K27":[2,"K"],"K28":[3,"K"],"K29":[3,"K"],"K30":[3,"K"],"K31":[3,"K"],"K32":[3,"K"],"K33":[3,"K"],"K34":[3,"K"],"K35":[4,"K"],"K36":[4,"K"],"K37":[4,"K"],"WK01":[2,"WK"],"WK02":[2,"WK"],"WK03":[3,"WK"],"WK04":[3,"WK"],"UK01":[2,"UK"],"UK02":[2,"UK"],"UK03":[3,"UK"],"UK04":[3,"UK"],"KR01":[2,"KR"],"KR02":[2,"KR"],"KR03":[3,"KR"],"KR04":[3,"KR"],"KG01":[2,"KG"],"KG02":[2,"KG"],"KG03":[3,"KG"],"KG04":[3,"KG"],"C17":[1,""],"C18":[1,""],"C19":[2,""],"C20":[2,""],"C21":[3,""],"W41":[1,"W"],"W42":[2,"W"],"U41":[1,"U"],"U42":[2,"U"],"G41":[1,"G"],"G42":[2,"G"],"R41":[1,"R"],"R42":[2,"R"],"W44":[4,"W"],"U44":[4,"U"],"K40":[4,"K"],"R43":[4,"R"],"G44":[4,"G"],"W43":[3,"W"],"U43":[3,"U"],"K38":[3,"K"],"G43":[3,"G"],"U45":[2,"U"],"K42":[2,"K"],"R44":[2,"R"],"G45":[2,"G"],"K39":[3,"K"],"K41":[4,"K"],"W82":[1,"W"],"W83":[1,"W"],"W84":[1,"W"],"W85":[1,"W"],"W86":[1,"W"],"W87":[2,"W"],"W88":[2,"W"],"W89":[2,"W"],"W90":[3,"W"],"W91":[4,"W"],"U76":[1,"U"],"U77":[1,"U"],"U78":[1,"U"],"U79":[1,"U"],"U80":[1,"U"],"U81":[2,"U"],"U82":[2,"U"],"U83":[2,"U"],"U84":[3,"U"],"U85":[4,"U"],"R74":[1,"R"],"R75":[1,"R"],"R76":[1,"R"],"R77":[1,"R"],"R78":[1,"R"],"R79":[2,"R"],"R80":[2,"R"],"R81":[2,"R"],"R82":[3,"R"],"R83":[4,"R"],"G77":[1,"G"],"G78":[1,"G"],"G79":[1,"G"],"G80":[1,"G"],"G81":[1,"G"],"G82":[2,"G"],"G83":[2,"G"],"G84":[2,"G"],"G85":[3,"G"],"G86":[4,"G"],"W45":[1,"W"],"W46":[1,"W"],"W47":[1,"W"],"W48":[1,"W"],"W49":[1,"W"],"W50":[2,"W"],"W51":[2,"W"],"W52":[2,"W"],"W53":[3,"W"],"W54":[3,"W"],"W55":[3,"W"],"W56":[4,"W"],"U46":[1,"U"],"U47":[1,"U"],"U48":[1,"U"],"U49":[1,"U"],"U50":[1,"U"],"U51":[2,"U"],"U52":[2,"U"],"U53":[2,"U"],"U54":[3,"U"],"U55":[3,"U"],"U56":[3,"U"],"U57":[4,"U"],"K43":[1,"K"],"K44":[1,"K"],"K45":[1,"K"],"K46":[1,"K"],"K47":[1,"K"],"K48":[2,"K"],"K49":[2,"K"],"K50":[2,"K"],"K51":[3,"K"],"K52":[3,"K"],"K53":[3,"K"],"K54":[4,"K"],"R45":[1,"R"],"R46":[1,"R"],"R47":[1,"R"],"R48":[1,"R"],"R49":[1,"R"],"R50":[2,"R"],"R51":[2,"R"],"R52":[2,"R"],"R53":[3,"R"],"R54":[3,"R"],"R55":[3,"R"],"R56":[4,"R"],"G46":[1,"G"],"G47":[1,"G"],"G48":[1,"G"],"G49":[1,"G"],"G50":[1,"G"],"G51":[2,"G"],"G52":[2,"G"],"G53":[2,"G"],"G54":[3,"G"],"G55":[3,"G"],"G56":[3,"G"],"G57":[4,"G"],"WG05":[2,"WG"],"WU05":[2,"WU"],"RW05":[2,"RW"],"UR05":[2,"UR"],"RG05":[2,"RG"],"GU05":[2,"GU"],"WK05":[2,"WK"],"UK05":[2,"UK"],"KR05":[2,"KR"],"KG05":[2,"KG"],"C22":[1,""],"C23":[2,""],"C24":[2,""],"C25":[3,""],"W57":[1,"W"],"W58":[1,"W"],"W59":[1,"W"],"W60":[1,"W"],"W61":[1,"W"],"W62":[2,"W"],"W63":[2,"W"],"W64":[2,"W"],"W65":[3,"W"],"W66":[3,"W"],"W67":[3,"W"],"W68":[4,"W"],"U58":[1,"U"],"U59":[1,"U"],"U60":[1,"U"],"U61":[1,"U"],"U62":[1,"U"],"U63":[2,"U"],"U64":[2,"U"],"U65":[2,"U"],"U66":[3,"U"],"U67":[3,"U"],"U68":[3,"U"],"U69":[4,"U"],"K55":[1,"K"],"K56":[1,"K"],"K57":[1,"K"],"K58":[1,"K"],"K59":[1,"K"],"K60":[2,"K"],"K61":[2,"K"],"K62":[2,"K"],"K63":[3,"K"],"K64":[3,"K"],"K65":[3,"K"],"K66":[4,"K"],"R57":[1,"R"],"R58":[1,"R"],"R59":[1,"R"],"R60":[1,"R"],"R61":[1,"R"],"R62":[2,"R"],"R63":[2,"R"],"R64":[2,"R"],"R65":[3,"R"],"R66":[3,"R"],"R67":[3,"R"],"R68":[4,"R"],"G58":[1,"G"],"G59":[1,"G"],"G60":[1,"G"],"G61":[1,"G"],"G62":[1,"G"],"G63":[2,"G"],"G64":[2,"G"],"G65":[2,"G"],"G66":[3,"G"],"G67":[3,"G"],"G68":[3,"G"],"G69":[4,"G"],"WK06":[4,"WK"],"UR06":[4,"UR"],"KG06":[4,"KG"],"RW06":[4,"RW"],"GU06":[4,"GU"],"WK07":[3,"WK"],"UR07":[3,"UR"],"KG07":[3,"KG"],"RW07":[3,"RW"],"GU07":[3,"GU"],"WK08":[2,"WK"],"UR08":[2,"UR"],"KG08":[2,"KG"],"RW08":[2,"RW"],"GU08":[2,"GU"],"WU06":[2,"WU"],"UK06":[2,"UK"],"KR06":[2,"KR"],"RG06":[2,"RG"],"WG06":[2,"WG"],"C26":[3,""],"C27":[1,""],"C28":[1,""],"C29":[2,""],"LS01":[1,""],"LS02":[1,"W"],"LS03":[1,"KG"],"LS04":[1,"GU"],"LS05":[1,""],"LS06":[1,""],"LS07":[1,"UR"],"LS08":[1,"U"],"LS09":[1,"K"],"LS10":[3,""],"AB01":[4,"","WKG"],"JE01":[4,"","URW"],"SU01":[4,"","KGU"],"MA01":[4,"","RWK"],"TE01":[4,"","GUR"],"AB02":[3,"WKG"],"JE02":[3,"URW"],"SU02":[3,"KGU"],"MA02":[3,"RWK"],"TE02":[3,"GUR"],"AB03":[2,"WKG"],"JE03":[2,"URW"],"SU03":[2,"KGU"],"MA03":[2,"RWK"],"TE03":[2,"GUR"],"RG07":[4,"RG"],"WG07":[4,"WG"],"KR07":[4,"KR"],"WU07":[4,"WU"],"UK07":[4,"UK"],"W76":[2,"W"],"W77":[1,"W"],"W78":[2,"W"],"U75":[1,"U"],"K71":[1,"K"],"K72":[1,"K"],"W79":[2,"W"],"WK09":[2,"WK"],"WK10":[2,"WK"],"G74":[1,"G"],"TE04":[2,"GUR"],"RG08":[2,"RG"],"WG08":[2,"WG"],"KR08":[2,"KR"],"WU08":[2,"WU"],"UK08":[2,"UK"],"R71":[1,"R"],"G72":[1,"G"],"W71":[1,"W"],"K69":[1,"K"],"R72":[1,"R"],"W72":[1,"W"],"W73":[2,"W"],"W74":[1,"W"],"U72":[1,"U"],"U73":[1,"U"],"K70":[2,"K"],"R73":[2,"R"],"W75":[1,"W"],"G73":[1,"G"],"U74":[2,"U"],"W80":[2,"W"],"W81":[3,"W"],"G75":[1,"G"],"G76":[1,"G"],"YW01":[1,"W"],"YW02":[2,"W"],"YW03":[1,"W"],"YW04":[3,"W"],"YW05":[3,"W"],"YU01":[1,"U"],"YU02":[2,"U"],"YU03":[2,"U"],"YU04":[3,"U"],"YU05":[4,"U"],"YK01":[1,"K"],"YK02":[2,"K"],"YK03":[2,"K"],"YK04":[3,"K"],"YK05":[4,"K"],"YR01":[1,"R"],"YR02":[1,"R"],"YR03":[2,"R"],"YR04":[2,"R"],"YR05":[3,"R"],"YG01":[1,"G"],"YG02":[1,"G"],"YG03":[2,"G"],"YG04":[3,"G"],"YG05":[4,"G"],"YM01":[3,"WU"],"YM02":[2,"RW"],"YM03":[4,"KG"],"YC01":[3,""],"YC02":[2,""],"YT01":[1,"W"],"PW01":[4,"W"],"PW02":[4,"U"],"PW03":[4,"K"],"PW04":[4,"R"],"PW05":[4,"G"],"PW06":[4,"WU"],"PW07":[4,"WK"],"PW08":[4,"RG"],"PW09":[4,"UR"],"PW10":[4,""],"PW11":[2,"W"],"PW12":[2,"U"],"PW13":[2,"R"],"PW14":[1,"G"],"PW15":[3,"WK"],"PW16":[3,"WU"],"PW17":[1,"W"],"PW18":[1,"U"],"PW19":[1,"U"],"PW20":[3,"U"],"PW21":[1,"K"],"PW22":[1,"R"],"PW23":[1,"G"],"PW24":[1,"G"],"PW25":[2,"G"],"PW26":[3,"W"],"PW27":[3,"U"],"PW28":[3,"K"],"PW29":[3,"R"],"PW30":[3,"G"],"RV01":[1,""],"RV02":[1,"RW"],"RV03":[2,"RW"],"RV04":[2,"RW"],"RV05":[4,"RW"],"RV06":[1,""],"RV07":[1,"GW"],"RV08":[2,"GW"],"RV09":[2,"GW"],"RV10":[3,"GW"],"RV11":[1,""],"RV12":[1,"GU"],"RV13":[2,"GU"],"RV14":[2,"GU"],"RV15":[3,"GU"],"RV16":[1,""],"RV17":[1,"UR"],"RV18":[2,"UR"],"RV19":[2,"UR"],"RV20":[4,"UR"],"RV21":[1,""],"RV22":[1,"KG"],"RV23":[2,"KG"],"RV24":[2,"KG"],"RV25":[3,"KG"],"RV26":[1,""],"RV27":[1,"WU"],"RV28":[2,"WU"],"RV29":[2,"WU"],"RV30":[4,"WU"],"RV31":[1,""],"RV32":[1,"KR"],"RV33":[2,"KR"],"RV34":[2,"KR"],"RV35":[4,"KR"],"RV36":[1,""],"RV37":[1,"WK"],"RV38":[2,"WK"],"RV39":[2,"WK"],"RV40":[3,"WK"],"RV41":[1,""],"RV42":[1,"RG"],"RV43":[2,"RG"],"RV44":[2,"RG"],"RV45":[4,"RG"],"RV46":[1,""],"RV47":[1,"UK"],"RV48":[2,"UK"],"RV49":[2,"UK"],"RV50":[3,"UK"],"FG01":[2,"W"],"FG02":[4,"W"],"FG03":[3,"W"],"FG04":[2,"R"],"FG05":[4,"R"],"FG06":[3,"R"],"FG07":[2,"G"],"FG08":[3,"U"],"FG09":[2,"K"],"FG10":[2,"U"],"FG11":[4,"U"],"FG12":[4,"G"],"FG13":[2,"R"],"FG14":[3,"K"],"FG15":[3,"G"],"FG16":[2,""],"FG17":[3,""],"FG18":[1,"G"],"FG19":[1,"W"],"FG20":[4,""],"FG21":[1,"W"],"FG22":[1,"W"],"FG23":[1,"U"],"FG24":[1,"U"],"FG25":[1,"K"],"FG26":[1,"K"],"FG27":[1,"R"],"FG28":[1,"R"],"FG29":[1,"G"],"FG30":[1,"G"],"FG31":[1,"U"],"FG32":[1,"W"],"FG33":[1,"R"],"FG34":[1,"G"],"FG35":[2,"K"],"FG36":[2,"U"],"FG37":[2,"K"],"FG38":[3,"K"],"FG39":[2,"W"],"FG40":[1,""],"FG41":[1,"W"],"FG42":[1,"W"],"FG43":[2,"W"],"FG44":[2,"W"],"FG45":[3,"W"],"FG46":[1,"W"],"FG47":[1,"U"],"FG48":[1,"U"],"FG49":[2,"U"],"FG50":[3,"U"],"FG51":[1,"U"],"FG52":[4,"U"],"FG53":[1,"K"],"FG54":[1,"K"],"FG55":[2,"K"],"FG56":[1,"K"],"FG57":[3,"K"],"FG58":[4,"K"],"FG59":[1,"R"],"FG60":[1,"R"],"FG61":[2,"R"],"FG62":[1,"R"],"FG63":[3,"R"],"FG64":[4,"R"],"FG65":[1,"G"],"FG66":[1,"G"],"FG67":[2,"G"],"FG68":[1,"G"],"FG69":[3,"G"],"FG70":[4,"G"],"FG71":[2,"W"],"FG72":[2,"U"],"FG73":[2,"R"],"FG74":[2,"G"],"FG75":[2,"K"],"FG76":[4,"W"],"FG77":[3,"W"],"FG78":[3,"W"],"FG79":[4,"U"],"FG80":[3,"U"],"FG81":[3,"U"],"FG82":[4,"R"],"FG83":[3,"R"],"FG84":[3,"R"],"FG85":[4,"G"],"FG86":[3,"G"],"FG87":[3,"G"],"FG88":[4,"K"],"FG89":[3,"K"],"FG90":[3,"K"],"SR01":[3,"W"],"SR02":[2,"W"],"SR03":[2,"U"],"SR04":[3,"R"],"SR05":[3,"K"],"SR06":[4,"W"],"SR07":[4,"U"],"SR08":[3,"K"],"SR09":[4,"K"],"SR10":[3,"U"],"SR11":[3,"W"],"SR12":[3,"K"],"SR13":[3,"W"],"SR14":[4,"U"],"SR15":[4,"R"],"SR16":[3,"R"],"SR17":[3,"G"],"SR18":[2,""],"SR19":[4,""],"SR20":[2,"G"],"SR21":[4,"K"],"SR22":[4,"G"],"SR23":[2,"W"],"SR24":[2,"G"],"SR25":[2,"W"],"SR26":[2,"R"],"SR27":[2,"K"],"SR28":[2,"R"],"SR29":[2,"U"],"SR30":[2,"R"],"SR31":[2,"G"],"SR32":[2,"K"],"SR33":[3,"U"],"SR34":[3,"G"],"SR35":[2,"R"],"SR36":[2,"W"],"SR37":[2,"G"],"SR38":[2,"UR"],"SR39":[1,"W"],"SR40":[1,"W"],"SR41":[1,"W"],"SR42":[1,"U"],"SR43":[1,"U"],"SR44":[1,"U"],"SR45":[1,"K"],"SR46":[1,"K"],"SR47":[1,"K"],"SR48":[1,"K"],"SR49":[1,"R"],"SR50":[1,"R"],"SR51":[1,"R"],"SR52":[1,"G"],"SR53":[1,"G"],"SR54":[1,"G"],"SR55":[1,"G"],"SR56":[1,"W"],"SR57":[1,"W"],"SR58":[1,"W"],"SR59":[1,""],"SR60":[1,"U"],"SR61":[1,"U"],"SR62":[1,"K"],"SR63":[1,"K"],"SR64":[1,"K"],"SR65":[1,"R"],"SR66":[1,"R"],"SR67":[1,""],"SR68":[1,"G"],"SR69":[1,"G"],"SR70":[1,"G"],"SR71":[2,"W"],"SR72":[2,"W"],"SR73":[3,"U"],"SR74":[2,"U"],"SR75":[3,"K"],"SR76":[2,"K"],"SR77":[2,"K"],"SR78":[2,"R"],"SR79":[2,"R"],"SR80":[2,"G"],"ZZ01":[3,"W"],"ZZ02":[3,"K"],"ZZ03":[3,"G"],"ZZ04":[3,"G"],"ZZ05":[4,"U"],"ZZ06":[4,"U"],"ZZ07":[2,"W"],"ZZ08":[2,"G"],"ZZ09":[3,"R"],"ZZ10":[2,"W"],"ZZ11":[2,"W"],"ZZ12":[2,"R"],"ZZ13":[4,"U"],"ZZ14":[3,"W"],"ZZ15":[4,"W"],"ZZ16":[2,"U"],"ZZ17":[4,"K"],"ZZ18":[3,"W"],"ZZ19":[4,"G"],"ZZ20":[3,"W"],"ZZ21":[3,"G"],"ZZ22":[4,"R"],"ZZ23":[2,"G"],"ZZ24":[2,"R"],"ZZ25":[2,"R"],"ZZ26":[4,"R"],"ZZ27":[2,"K"],"ZZ28":[3,"R"],"ZZ29":[1,"W"],"ZZ30":[1,"W"],"ZZ31":[1,"U"],"ZZ32":[1,"U"],"ZZ33":[1,"K"],"ZZ34":[1,"K"],"ZZ35":[1,"K"],"ZZ36":[1,"K"],"ZZ37":[1,"R"],"ZZ38":[1,"R"],"ZZ39":[1,"R"],"ZZ40":[1,"G"],"ZZ41":[1,"G"],"ZZ42":[1,"G"],"ZZ43":[1,"U"],"ZZ44":[1,"W"],"ZZ45":[2,""],"ZZ46":[1,""],"ZZ47":[1,""],"ZZ48":[2,""],"ZZ49":[2,""],"ZZ50":[2,""],"ZZ51":[2,""],"ZZ52":[2,""],"ZZ53":[1,""],"ZZ54":[1,"W"],"ZZ55":[1,"R"],"ZZ56":[1,"G"],"ZZ57":[1,"W"],"ZZ58":[1,"K"],"ZZ59":[2,"R"],"ZZ60":[1,"K"],"ZZ61":[2,"K"],"ZZ62":[1,""],"ZZ63":[2,"G"],"ZZ64":[1,"R"],"ZZ65":[1,"W"],"ZZ66":[1,"W"],"ZZ67":[1,"G"],"ZZ68":[2,"G"],"ZZ69":[1,"U"],"ZZ70":[1,"U"],"ZZ71":[2,"W"],"ZZ72":[2,"W"],"ZZ73":[3,"U"],"ZZ74":[2,"U"],"ZZ75":[3,"K"],"ZZ76":[3,"K"],"ZZ77":[2,"R"],"ZZ78":[2,"R"],"ZZ79":[2,"G"],"ZZ80":[3,"G"],"ZZ81":[3,"U"],"CM01":[1,"W"],"CM02":[1,"W"],"CM03":[2,"W"],"CM04":[2,"K"],"CM05":[1,"G"],"CM06":[1,"G"],"CM07":[1,"W"],"CM08":[3,"WKG"],"CM09":[1,"R"],"CM10":[2,"U"],"CM11":[1,"U"],"CM12":[2,"U"],"CM13":[1,"W"],"CM14":[1,"U"],"CM15":[1,"R"],"CM16":[3,"URW"],"CM17":[1,"G"],"CM18":[1,"K"],"CM19":[2,"K"],"CM20":[2,"KGU"],"CM21":[3,"K"],"CM22":[1,"KG"],"CM23":[1,"K"],"CM24":[1,"U"],"CM25":[1,"W"],"CM26":[2,"R"],"CM27":[1,"R"],"CM28":[1,"R"],"CM29":[1,"RWK"],"CM30":[2,"K"],"CM31":[1,"K"],"CM32":[3,"RWK"],"CM33":[1,"G"],"CM34":[1,"U"],"CM35":[1,"R"],"CM36":[1,"G"],"CM37":[2,"G"],"CM38":[1,"G"],"CM39":[2,"R"],"CM40":[3,"GUR"],"CM41":[3,"R"],"CM42":[1,"R"],"CM43":[1,"R"],"CM44":[1,"R"],"CM45":[1,"R"],"CM46":[1,"G"],"CM47":[2,"R"],"CM48":[2,"G"],"CM49":[1,"W"],"CM50":[1,"W"],"CM51":[2,"W"],"CM52":[1,"W"],"CM53":[1,"G"],"CM54":[1,"G"],"CM55":[2,"W"],"CM56":[3,"WG"],"CM57":[1,"R"],"CM58":[2,"R"],"CM59":[1,"R"],"CM60":[1,"K"],"CM61":[1,"R"],"CM62":[1,"K"],"CM63":[2,"K"],"CM64":[3,"KR"],"CM65":[1,"U"],"CM66":[1,"U"],"CM67":[1,"W"],"CM68":[1,"U"],"CM69":[2,"U"],"CM70":[1,"W"],"CM71":[2,"U"],"CM72":[3,"W"],"CM73":[1,"U"],"CM74":[1,"K"],"CM75":[1,"K"],"CM76":[1,"K"],"CM77":[2,"K"],"CM78":[1,"K"],"CM79":[2,"U"],"CM80":[3,"K"],"B01":[0,"W"],"B02":[0,"U"],"B03":[0,"G"],"B04":[0,"R"],"B05":[0,""],"B06":[0,"K"],"MS01":[3,""]};
// 弾（build_gas.mjs が 書きこむ）：{ main: [ふつうの 弾], extra: [サブセット・番外編], released: [出ている 弾] }
var SET_IDS = {"main":[1,2,3,4,5],"extra":[6,7,8,9,10,11,12],"released":[1,2]};
var BUILT = 1793185672649;          // この Code.gs と index.html を つくった 時刻（build_gas.mjs）
var SERVER_VER = '03e3afd28c1f';   // サーバーの しくみの 版（tools/gas_Code.gs の ハッシュ）。ゲーム本体と あって いないと 最新に できない
var NAME_A = 20, NAME_B = 20; // なまえの 定型語の 数（js/ui/online.js の NAME_A・NAME_B）
var CODE_C = 10;              // あいことばの 3つめの ことば（かず）の 数
var DECK_SIZE = 20, CAPACITY = 30;
var POINTS = { w: 2, d: 1, l: -1 };  // デッキの 点：かち・ひきわけ・まけ
var RANK_SIZE = 20;                 // ランキングに のせる 数
var JST = 9 * 3600 * 1000;
var SAVE_CELL = 45000;              // ひきつぎ：1マスに 入れる 文字数（1マスの 上限は 5万字）
var SAVE_MAX = 40 * SAVE_CELL;      // ひきつぎの 大きさの 上限（約 1.8MB）

// ───── スプレッドシート ─────
// [シートの なまえ, 見出し]。どの シートも 書式は「書式なしテキスト」（ID や 日時が 勝手に 数や 日付に ならないように）
var SHEETS = {
  conf: ['せってい', ['こうもく', 'あたい', 'せつめい']],
  admin: ['かんりしゃ', ['メールアドレス', 'メモ']],
  ghost: ['ゴースト', ['ID', '階', 'なまえ1', 'なまえ2', 'デッキ', 'かち', 'まけ', 'あずけた日時']],
  deck: ['デッキの点', ['ID', '点', 'なまえ1', 'なまえ2', '色', 'こうしん']],
  rank: ['ランキング', ['じゅんい', '点', 'なまえ1', 'なまえ2', '色', 'ID']],
  raid: ['レイド', ['レイドID', 'しゅるい', 'キー', '点']],
  raidg: ['レイドゴースト', ['レイドID', '陣営', 'ID', '統率者', 'デッキ', 'なまえ1', 'なまえ2', '日時', 'まもった', 'いる']],
  code: ['あいことば', ['ことば', 'カードID', 'はじまり', 'おわり', 'のこり', 'メモ']],
  used: ['あいことばの記録', ['ことば', 'ひと', '日時']],
  save: ['ひきつぎ', ['ひと', '日時', 'おおきさ', 'データ']],
  game: ['ゲーム本体', ['index', 'cards']] // GitHub から とった ゲーム本体と カードの 一覧（45000字ずつ 下へ）。さわらない
};
// せってい シートの こうもく：[キー, はじめの あたい, せつめい]
var CONF = [
  ['パックの弾', '', 'パックに 入れる 弾の 番号（カンマで くぎる。例：1,2）。空なら 出ている 弾 ぜんぶ'],
  ['つかわない弾', '', 'もんしょうで 解放（かいほう）しても まぜない サブセット・番外編の 番号（例：10,11,12）'],
  ['レイドID', 'tarkir-1', 'レイドの なまえ（tarkir-1、tarkir-2 …。かえると 点と ゴーストが 0から）'],
  ['レイドのおわり', '2026/11/01 20:00', 'レイドが おわる 日時（日本時間）。空なら レイドなし'],
  ['ランキングの時刻', '7,17', 'ランキングを こうしんする 時刻（日本時間・カンマで くぎる）'],
  ['ゴーストの数', '30', 'とどいた 階ごとに のこす ゴーストの 数（ふるい ものから けす）'],
  ['レイドゴーストの数', '20', '陣営ごとに のこす レイドの ゴーストの 数'],
  ['読みこみ元', 'main', '「ゲームを 最新に する」で ゲーム本体を とる GitHub の ブランチ（ふつうは main）']
];

// データを おく スプレッドシート。スクリプト プロパティ SHEET_ID が あれば その シート（学校の アカウントの ドライブに おく とき）、
// なければ スクリプトが ついて いる シート
var BOOK_ = null;
function book_() {
  if (BOOK_) return BOOK_;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(String(id).trim()) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートが ない');
  return (BOOK_ = ss);
}
var SH_ = {};
function sh_(k) {
  if (SH_[k]) return SH_[k];
  var d = SHEETS[k], ss = book_(), s = ss.getSheetByName(d[0]);
  if (!s) {
    s = ss.insertSheet(d[0]);
    var w = k === 'save' ? 4 + SAVE_MAX / SAVE_CELL : d[1].length;
    if (s.getMaxColumns() < w) s.insertColumnsAfter(s.getMaxColumns(), w - s.getMaxColumns());
    s.getRange(1, 1, s.getMaxRows(), w).setNumberFormat('@');
    s.getRange(1, 1, 1, d[1].length).setValues([d[1]]).setFontWeight('bold');
    s.setFrozenRows(1);
    if (k === 'conf') s.getRange(2, 1, CONF.length, 3).setValues(CONF);
    if (k === 'game') { if (s.getMaxRows() < 120) s.insertRowsAfter(s.getMaxRows(), 120 - s.getMaxRows()); s.getRange(1, 1, s.getMaxRows(), 2).setNumberFormat('@'); try { s.hideSheet(); } catch (err) { /* みえても よい */ } }
  }
  SH_[k] = s;
  return s;
}
// データの 行（見出しの 下）。[ [セル…] … ]
function rows_(k) {
  var s = sh_(k), n = s.getLastRow(), w = Math.max(s.getLastColumn(), SHEETS[k][1].length);
  return n < 2 ? [] : s.getRange(2, 1, n - 1, w).getValues();
}
function put_(k, i, row) { var r = sh_(k).getRange(i + 2, 1, 1, row.length); r.setNumberFormat('@'); r.setValues([row.map(str_)]); } // i：データの 何行目（0から）
function add_(k, row) {
  var s = sh_(k), n = Math.max(s.getLastRow(), 1);
  if (n + 1 > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), 500); // シートの 行が たりなく なったら ふやす（書式は put_ で つける）
  put_(k, n - 1, row);
}
function del_(k, idx) { var s = sh_(k); idx.slice().sort(function (a, b) { return b - a; }).forEach(function (i) { s.deleteRow(i + 2); }); }
function str_(v) { return v === null || v === undefined ? '' : String(v); }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
// 日時は「2026/10/27 15:00:00」（日本時間）で 書く
function time_(ms) { return Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'); }
function ms_(v) {
  if (v instanceof Date) return v.getTime();
  var m = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - JST : 0;
}
function ids_(v) { return String(v || '').split(/[,、\s]+/).map(Number).filter(function (x) { return x > 0; }); }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// せってい（5分 おぼえておく。先生が かえたら すぐ わすれる）
function conf_() {
  var c = CacheService.getScriptCache(), v = c.get('conf');
  if (v) return JSON.parse(v);
  var o = {};
  CONF.forEach(function (r) { o[r[0]] = r[1]; });
  rows_('conf').forEach(function (r) { if (r[0]) o[String(r[0])] = str_(r[1]); });
  c.put('conf', JSON.stringify(o), 300);
  return o;
}
function setConf_(key, val) {
  var list = rows_('conf');
  for (var i = 0; i < list.length; i++) if (String(list[i][0]) === key) { put_('conf', i, [key, val]); return; }
  var def = CONF.filter(function (r) { return r[0] === key; })[0];
  add_('conf', [key, val, def ? def[2] : '']);
}
function keep_() { return Math.max(1, Math.min(200, num_(conf_()['ゴーストの数']) || 30)); }

// ───── ひと（学校アカウント）─────
// メールアドレスは シートに 書かない。ひきつぎ・あいことばの 記録には 読めない 番号（ハッシュ）を つかう
function email_() { try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (err) { return ''; } }
function owner_() { try { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (err) { return ''; } }
function who_() {
  var e = email_();
  if (!e) return '';
  var p = PropertiesService.getScriptProperties(), salt = p.getProperty('SALT');
  if (!salt) { salt = Utilities.getUuid(); p.setProperty('SALT', salt); }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + e).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 24);
}
// 先生（かんりしゃ）：この スクリプトを デプロイした 人と、かんりしゃ シートに 書いた 人
function isAdmin_() {
  var e = email_();
  if (!e) return false;
  if (e === owner_()) return true;
  return rows_('admin').some(function (r) { return String(r[0]).trim().toLowerCase() === e; });
}
function needAdmin_() { if (!isAdmin_()) throw new Error('先生だけが つかえる'); }

// ───── はじめに よぶ：せってい と じぶんの こと ─────
// → { admin, login, sets: [弾]|null, ban: [弾], raid: { id, ends }|null, saved: { at, size }|null }
function mtgConfig() {
  var c = conf_(), me = who_(), sets = ids_(c['パックの弾']).filter(function (x) { return sets_().main.indexOf(x) >= 0; });
  return {
    admin: isAdmin_(), login: !!me,
    sets: sets.length ? sets : null,
    ban: ids_(c['つかわない弾']).filter(function (x) { return sets_().extra.indexOf(x) >= 0; }),
    raid: raidNow_(),
    saved: me ? saveInfo_(me) : null
  };
}

// ───── オンライン バトル ─────
function idOk_(id) { return /^[1-6]-[0-9a-f]{8}$/.test(String(id || '')); }
function tierOf_(id) { var m = /^([1-6])-[0-9a-f]{8}$/.exec(String(id || '')); return m ? Number(m[1]) : 0; }
// デッキの 色（W・U・K・R・G の じゅん。旗が あれば 3色）
function pairOf_(d) {
  var has = {};
  d.forEach(function (id) { var c = cards_()[id]; if (c) for (var k = 0; k < c[1].length; k++) has[c[1].charAt(k)] = 1; });
  return 'WUKRG'.split('').filter(function (c) { return has[c]; }).join('');
}
// デッキが ルールどおりか（20まい・30点まで・2色まで。旗が あれば その 3色まで。きほんカードは 0点）
function checkDeck_(d) {
  if (!Array.isArray(d) || d.length !== DECK_SIZE) throw new Error('デッキは 20まい');
  var pts = 0, colors = {}, count = {}, banner = null;
  for (var i = 0; i < d.length; i++) {
    var c = cards_()[d[i]];
    if (!c) throw new Error('しらない カード');
    pts += c[0];
    if (c[2]) banner = c[2];
    for (var k = 0; k < c[1].length; k++) colors[c[1].charAt(k)] = 1;
    count[d[i]] = (count[d[i]] || 0) + 1;
    if (c[0] > 0 && count[d[i]] > 8) throw new Error('おなじ カードが おおすぎる');
  }
  if (pts > CAPACITY) throw new Error('点数が おおすぎる');
  var cs = Object.keys(colors);
  if (cs.length > 2 && !(banner && cs.length <= 3 && cs.every(function (k) { return banner.indexOf(k) >= 0; }))) throw new Error('色が おおすぎる');
  return d.map(String);
}
function checkName_(n) {
  if (!Array.isArray(n) || n.length !== 2) return [0, 0];
  var a = Math.floor(Number(n[0])), b = Math.floor(Number(n[1]));
  return [a >= 0 && a < NAME_A ? a : 0, b >= 0 && b < NAME_B ? b : 0];
}
// ゴーストの 行 ⇔ { i, t, n, d, w, l, c }
function ghostOf_(r) { return { i: String(r[0]), t: num_(r[1]), n: [num_(r[2]), num_(r[3])], d: JSON.parse(r[4] || '[]'), w: num_(r[5]), l: num_(r[6]), c: ms_(r[7]) }; }
function ghostRow_(g) { return [g.i, g.t, g.n[0], g.n[1], JSON.stringify(g.d), g.w, g.l, time_(g.c)]; }
function findRow_(k, id) { var list = rows_(k); for (var i = 0; i < list.length; i++) if (String(list[i][0]) === id) return { i: i, r: list[i] }; return null; }

// ゴーストを あずける。{ d: [カードID×20], t: とどいた 階（1〜5、クリアは 6）, n: [なまえ, なまえ] } → { i: ID }
function mtgSubmitGhost(g) {
  var tier = Math.floor(Number(g && g.t));
  if (!(tier >= 1 && tier <= 6)) throw new Error('階が おかしい');
  var ghost = {
    i: tier + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8),
    n: checkName_(g.n), d: checkDeck_(g.d), t: tier, w: 0, l: 0, c: Date.now()
  };
  withLock_(function () {
    add_('ghost', ghostRow_(ghost));
    // おなじ 階が おおすぎたら ふるい ものから けす
    var same = [];
    rows_('ghost').forEach(function (r, i) { if (num_(r[1]) === tier) same.push(i); });
    if (same.length > keep_()) del_('ghost', same.slice(0, same.length - keep_()));
    // デッキの 点（ゴーストが けされても のこる）
    add_('deck', [ghost.i, 0, ghost.n[0], ghost.n[1], pairOf_(ghost.d), time_(ghost.c)]);
  });
  return { i: ghost.i };
}

// あいてを さがす：あずかっている ゴースト ぜんぶから ランダムに 1人（じぶんの ゴーストは のぞく）。いなければ null
// { x: [じぶんの ゴーストID] }
function mtgRandomGhost(q) {
  var mine = (q && Array.isArray(q.x)) ? q.x.map(String) : [];
  var pool = rows_('ghost').filter(function (r) { return r[0] && mine.indexOf(String(r[0])) < 0; });
  return pool.length ? ghostOf_(pool[Math.floor(Math.random() * pool.length)]) : null;
}

// ゴーストの 勝ち負けを 1つ たす（win：ゴーストが かった）
function ghostWL_(id, win) {
  var h = findRow_('ghost', id);
  if (!h) return null;
  var g = ghostOf_(h.r);
  if (win) g.w = Math.min(99999, g.w + 1); else g.l = Math.min(99999, g.l + 1);
  put_('ghost', h.i, ghostRow_(g));
  return g;
}
// （ふるい 画面の ため のこす）たたかいの けっか：{ i: ゴーストID, w: ゴーストが かったか }
function mtgReport(r) {
  var id = String((r && r.i) || '');
  if (!tierOf_(id)) throw new Error('ゴーストが いない');
  return withLock_(function () { var g = ghostWL_(id, !!r.w); return g ? { w: g.w, l: g.l } : null; });
}

// たたかいの けっか（デッキの 点つき）：{ g: あいての ゴーストID, i: じぶんの デッキID, r: 'w'|'l'|'d'（じぶんから 見て）, n: なまえ, p: 2色 }
// → { s: じぶんの デッキの 点 }（デッキIDが ない とき・サーバーに ない ときは s: null）
function mtgResult(q) {
  var res = String(q && q.r);
  if (!(res in POINTS)) throw new Error('けっかが おかしい');
  return withLock_(function () {
    // あいての ゴーストの 勝ち負け（ひきわけは 数えない）
    var gid = String(q.g || '');
    if (tierOf_(gid) && res !== 'd') ghostWL_(gid, res === 'l');
    // じぶんの デッキの 点
    var id = String(q.i || '');
    if (!idOk_(id)) return { s: null };
    var h = findRow_('deck', id), n = checkName_(q.n);
    var s = Math.max(0, Math.min(99999, (h ? num_(h.r[1]) : 0) + POINTS[res]));
    var row = [id, s, n[0], n[1], h ? str_(h.r[4]) : String(q.p || '').replace(/[^WUKGR]/g, '').slice(0, 3), time_(Date.now())];
    if (h) put_('deck', h.i, row); else add_('deck', row);
    return { s: s };
  });
}

// ランキング：上位20の デッキ。毎日 ランキングの時刻 に こうしんする（その あとで はじめて 見た 人が つくりなおす）
// → { at: こうしんした 時刻, next: つぎの こうしん, l: [[点, なまえ1, なまえ2, 2色, デッキID]…] }
function slots_(now) {
  var hours = ids_(conf_()['ランキングの時刻']).filter(function (h) { return h < 24; });
  if (!hours.length) hours = [7, 17];
  // 日本時間の きょう 0時（UTC の ミリ秒）
  var day = Math.floor((now + JST) / 86400000) * 86400000 - JST;
  var all = [];
  [-1, 0, 1].forEach(function (k) { hours.forEach(function (h) { all.push(day + k * 86400000 + h * 3600000); }); });
  all.sort(function (a, b) { return a - b; });
  var last = all.filter(function (x) { return x <= now; }).pop();
  var next = all.filter(function (x) { return x > now; })[0];
  return { last: last, next: next };
}
function rankSnap_() {
  var at = num_(PropertiesService.getScriptProperties().getProperty('RANK_AT'));
  return { at: at, l: rows_('rank').map(function (r) { return [num_(r[1]), num_(r[2]), num_(r[3]), String(r[4]), String(r[5])]; }) };
}
function mtgRanking() {
  var now = Date.now(), sl = slots_(now), snap = rankSnap_();
  if (snap.at < sl.last) {
    snap = withLock_(function () {
      var cur = rankSnap_();
      if (cur.at >= sl.last) return cur;
      var rows = [], old = [];
      rows_('deck').forEach(function (r, i) {
        var s = num_(r[1]), u = ms_(r[5]);
        // 0点の まま 30日 たった デッキは けす
        if (!s && now - u > 30 * 86400000) { old.push(i); return; }
        if (s > 0) rows.push([s, num_(r[2]), num_(r[3]), String(r[4]), String(r[0]), u]);
      });
      if (old.length) del_('deck', old);
      rows.sort(function (a, b) { return b[0] - a[0] || a[5] - b[5]; }); // 点が 同じなら 先に とった デッキが 上
      var top = rows.slice(0, RANK_SIZE);
      var s = sh_('rank');
      if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 6).clearContent();
      top.forEach(function (r, i) { put_('rank', i, [i + 1, r[0], r[1], r[2], r[3], r[4]]); });
      PropertiesService.getScriptProperties().setProperty('RANK_AT', String(sl.last));
      return { at: sl.last, l: top.map(function (r) { return r.slice(0, 5); }) };
    });
  }
  return { at: snap.at, next: sl.next, l: snap.l };
}

// じぶんの ゴーストの 勝ち負けと デッキの 点：[ID…] → [{ i, w, l, s }]（もう けされた ものは かえさない）
function mtgMyGhosts(ids) {
  if (!Array.isArray(ids)) return [];
  var gs = {}, ds = {}, out = [];
  rows_('ghost').forEach(function (r) { gs[String(r[0])] = r; });
  rows_('deck').forEach(function (r) { ds[String(r[0])] = r; });
  ids.slice(0, 10).forEach(function (id) {
    id = String(id); if (!tierOf_(id)) return;
    var g = gs[id] ? ghostOf_(gs[id]) : null, s = ds[id] ? num_(ds[id][1]) : null;
    if (g || s !== null) out.push({ i: id, w: g ? g.w : null, l: g ? g.l : null, s: s });
  });
  return out;
}

// ───── レイド（docs/RAID.md）：タルキール大戦（統率者戦）─────
// レイド シート：[レイドID, '陣営'|'統率者', キー, 点]
// レイドゴースト シート：[レイドID, 陣営, ゴーストID, 統率者, デッキ, なまえ1, なまえ2, 日時, まもった 回数, いる（1 / 空）]
//   陣営ごとに「レイドゴーストの数」まで いる。おちても 行は のこす（まもった 回数を おぼえて おくため）
// レイドの ID と おわる 時刻は せってい シート。おわった あとも 30分は たたかいの けっかを うけとる
var RAID_GRACE = 30 * 60 * 1000;
var RAID_CMD = { dragon: ['RG07', 'WG07', 'KR07', 'WU07', 'UK07'], human: ['AB02', 'JE02', 'SU02', 'MA02', 'TE02'] };
var RAID_DEF = 3; // ぼうえい点：ゴーストが かつと その 陣営に ＋3
function raidGid_(i) { i = String(i || ''); return /^[0-9a-f]{12}$/.test(i) ? i : ''; }
function raidNow_() { var c = conf_(), ends = ms_(c['レイドのおわり']), id = String(c['レイドID'] || ''); return ends && /^tarkir-\d+$/.test(id) ? { id: id, ends: ends } : null; }
function raidId_(q) { var r = raidNow_(), id = String(q && q.id); if (!r || r.id !== id) throw new Error('レイドが ない'); return id; }
function raidFaction_(q) { var f = String(q && q.f); if (!RAID_CMD[f]) throw new Error('陣営が おかしい'); return f; }
function raidCmd_(f, c) { c = String(c || ''); if (RAID_CMD[f].indexOf(c) < 0) throw new Error('統率者が おかしい'); return c; }
function raidLive_(grace) { var r = raidNow_(); if (!r || Date.now() > r.ends + (grace ? RAID_GRACE : 0)) throw new Error('レイドは おわった'); }
function raidKeep_() { return Math.max(1, Math.min(100, num_(conf_()['レイドゴーストの数']) || 20)); }
function raidScore_(id) {
  var s = { f: { dragon: 0, human: 0 }, c: {} };
  rows_('raid').forEach(function (r) { if (String(r[0]) !== id) return; if (r[1] === '陣営') s.f[String(r[2])] = num_(r[3]); else s.c[String(r[2])] = num_(r[3]); });
  return s;
}
function raidAddPts_(id, f, c, add) {
  var list = rows_('raid'), hitF = -1, hitC = -1;
  list.forEach(function (r, i) { if (String(r[0]) !== id) return; if (r[1] === '陣営' && String(r[2]) === f) hitF = i; if (r[1] === '統率者' && String(r[2]) === c) hitC = i; });
  var fv = Math.min(99999999, (hitF >= 0 ? num_(list[hitF][3]) : 0) + add), cv = Math.min(99999999, (hitC >= 0 ? num_(list[hitC][3]) : 0) + add);
  if (hitF >= 0) put_('raid', hitF, [id, '陣営', f, fv]); else add_('raid', [id, '陣営', f, fv]);
  if (hitC >= 0) put_('raid', hitC, [id, '統率者', c, cv]); else add_('raid', [id, '統率者', c, cv]);
}

// 点を たす：{ id, f, c, w: 1（かった）, fin: 1（統率者で とどめ）, q: といた 問題の 数 } → { f, c }
function mtgRaidAdd(q) {
  var id = raidId_(q), f = raidFaction_(q), c = raidCmd_(f, q.c);
  raidLive_(true);
  var add = (Number(q.w) === 1 ? 10 : 0) + (Number(q.w) === 1 && Number(q.fin) === 1 ? 5 : 0) + Math.max(0, Math.min(200, Math.floor(Number(q.q) || 0)));
  return withLock_(function () { raidAddPts_(id, f, c, add); return raidScore_(id); });
}
// 陣営と 統率者の 点。{ id, me: じぶんの ゴーストID, f: じぶんの 陣営 } → { f, c, mine: { w: まもった 回数, alive: ゴーストが いるか } }
function mtgRaidState(q) {
  var id = raidId_(q), s = raidScore_(id), me = raidGid_(q && q.me);
  if (me) {
    var g = rows_('raidg').filter(function (r) { return String(r[0]) === id && String(r[2]) === me; })[0];
    s.mine = { w: g ? num_(g[8]) : 0, alive: !!(g && String(g[9]) === '1') };
  }
  return s;
}
// ぼうえい：あいての ゴーストが かった。{ id, g: ゴーストID } → ゴーストの 陣営と 統率者に ＋3
function mtgRaidDefend(q) {
  var id = raidId_(q), gid = raidGid_(q && q.g);
  if (!gid) throw new Error('ゴーストが いない');
  raidLive_(true);
  return withLock_(function () {
    var list = rows_('raidg');
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (String(r[0]) !== id || String(r[2]) !== gid) continue;
      r[8] = num_(r[8]) + 1;
      put_('raidg', i, r.slice(0, 10));
      raidAddPts_(id, String(r[1]), String(r[3]), RAID_DEF);
      return { w: r[8] };
    }
    return null;
  });
}
// じぶんの 統率者デッキを ゴーストに：{ id, f, c, i: まえの ゴーストID, d: [カードID×20], n: [なまえ, なまえ] }。色は 統率者の 色だけ
function mtgRaidSubmit(q) {
  var id = raidId_(q), f = raidFaction_(q), c = raidCmd_(f, q.c);
  raidLive_(false);
  var d = q && q.d;
  if (!Array.isArray(d) || d.length !== DECK_SIZE) throw new Error('デッキは 20まい');
  var ok = cards_()[c][1];
  d = d.map(String);
  var pts = 0;
  d.forEach(function (x) { var k = cards_()[x]; if (!k) throw new Error('しらない カード'); pts += k[0]; for (var i = 0; i < k[1].length; i++) if (ok.indexOf(k[1].charAt(i)) < 0) throw new Error('統率者の 色で ない'); });
  if (pts > CAPACITY) throw new Error('点数が おおすぎる');
  var n = checkName_(q.n);
  return withLock_(function () {
    // おなじ ID で 出しなおす とき（いなく なった とき）は 入れかえ。まもった 回数は のこす
    var gid = raidGid_(q.i) || Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    var list = rows_('raidg'), def = 0, drop = [];
    list.forEach(function (r, i) { if (String(r[0]) === id && String(r[2]) === gid) { def = num_(r[8]); drop.push(i); } });
    if (drop.length) del_('raidg', drop);
    add_('raidg', [id, f, gid, c, JSON.stringify(d), n[0], n[1], time_(Date.now()), def, '1']);
    // 陣営の いる ゴーストが おおすぎたら ふるい ものから「いない」に する
    list = rows_('raidg');
    var alive = [];
    list.forEach(function (r, i) { if (String(r[0]) === id && String(r[1]) === f && String(r[9]) === '1') alive.push(i); });
    alive.slice(0, Math.max(0, alive.length - raidKeep_())).forEach(function (i) { var r = list[i].slice(0, 10); r[9] = ''; r[4] = ''; put_('raidg', i, r); });
    return { i: gid };
  });
}
// あいて：ちがう 陣営の ゴーストから ランダムに 1人。いなければ null
function mtgRaidGhost(q) {
  var id = raidId_(q), f = raidFaction_(q), other = f === 'dragon' ? 'human' : 'dragon';
  var list = rows_('raidg').filter(function (r) { return String(r[0]) === id && String(r[1]) === other && String(r[9]) === '1'; });
  if (!list.length) return null;
  var r = list[Math.floor(Math.random() * list.length)];
  return { i: String(r[2]), c: String(r[3]), d: JSON.parse(r[4] || '[]'), n: [num_(r[5]), num_(r[6])], u: ms_(r[7]) };
}

// ───── ひきつぎ（セーブの バックアップ）─────
// 学校アカウントごとに 1つ。シートの 1行：[ひと（読めない 番号）, 日時, おおきさ, データを 45000字ずつ …]
function saveInfo_(me) { var h = findRow_('save', me); return h ? { at: ms_(h.r[1]), size: num_(h.r[2]) } : null; }
function needWho_() { var me = who_(); if (!me) throw new Error('学校の アカウントで ひらいて ください'); return me; }
// あずける：data は セーブの 文字列（JSON）→ { at, size }
function mtgSaveUpload(data) {
  var me = needWho_();
  data = String(data || '');
  if (!data || data.length > SAVE_MAX) throw new Error('セーブが 大きすぎる');
  try { JSON.parse(data); } catch (err) { throw new Error('セーブが こわれて いる'); } // こわれた データは うけとらない
  var row = [me, time_(Date.now()), data.length];
  for (var k = 0; k < data.length; k += SAVE_CELL) row.push(data.slice(k, k + SAVE_CELL));
  return withLock_(function () {
    var h = findRow_('save', me), s = sh_('save');
    if (h) { s.getRange(h.i + 2, 1, 1, s.getLastColumn()).clearContent(); put_('save', h.i, row); } else add_('save', row);
    return saveInfo_(me);
  });
}
// もどす → { at, data }（あずけて いなければ null）
function mtgSaveDownload() {
  var me = needWho_(), h = findRow_('save', me);
  if (!h) return null;
  return { at: ms_(h.r[1]), data: h.r.slice(3).map(str_).join('') };
}

// ───── あいことば（docs/PROMO.md 2.2）─────
// ことばは 3つの 番号「a-b-c」（なまえの 定型語 NAME_A・NAME_B と かず）。プルダウンで えらぶので 打ちまちがいが ない
// 1つの アカウントで 1つの ことばは 1回だけ
function codeKey_(w) {
  if (!Array.isArray(w) || w.length !== 3) return '';
  var a = Math.floor(Number(w[0])), b = Math.floor(Number(w[1])), c = Math.floor(Number(w[2]));
  return a >= 0 && a < NAME_A && b >= 0 && b < NAME_B && c >= 0 && c < CODE_C ? a + '-' + b + '-' + c : '';
}
// { w: [a, b, c] } → { card: カードID }
function mtgRedeem(q) {
  var me = needWho_(), key = codeKey_(q && q.w);
  if (!key) throw new Error('ことばが おかしい');
  return withLock_(function () {
    var h = findRow_('code', key), now = Date.now();
    if (!h) throw new Error('その あいことばは ない');
    var r = h.r, from = ms_(r[2]), to = ms_(r[3]), left = String(r[4]) === '' ? -1 : num_(r[4]);
    if ((from && now < from) || (to && now > to)) throw new Error('いまは つかえない あいことば');
    if (rows_('used').some(function (u) { return String(u[0]) === key && String(u[1]) === me; })) throw new Error('もう もらった');
    if (left === 0) throw new Error('もう おわり');
    if (left > 0) { r = r.slice(0, 6); r[4] = left - 1; put_('code', h.i, r); }
    add_('used', [key, me, time_(now)]);
    return { card: String(r[1]) };
  });
}

// ───── 開発モード（先生だけ）─────
// 管理画面の ための ぜんぶ：{ conf: { こうもく: あたい }, admins: [[メール, メモ]], codes: [[ことば, カード, はじまり, おわり, のこり, メモ]], url, me, owner, count: { ghost, deck, save } }
function mtgAdminGet() {
  needAdmin_();
  return {
    conf: conf_(), url: book_().getUrl(), me: email_(), owner: owner_(),
    admins: rows_('admin').filter(function (r) { return r[0]; }).map(function (r) { return [str_(r[0]), str_(r[1])]; }),
    codes: rows_('code').filter(function (r) { return r[0]; }).map(function (r) { return r.slice(0, 6).map(str_); }),
    game: gameInfo_(),
    count: { ghost: rows_('ghost').length, deck: rows_('deck').length, save: rows_('save').length, used: rows_('used').length }
  };
}
// { conf: { こうもく: あたい }, admins: [[メール, メモ]], codes: [[ことば, カード, はじまり, おわり, のこり, メモ]] }（ある ものだけ かえる）
function mtgAdminSave(q) {
  needAdmin_();
  withLock_(function () {
    if (q && q.conf) CONF.forEach(function (c) { if (c[0] in q.conf) setConf_(c[0], String(q.conf[c[0]] == null ? '' : q.conf[c[0]]).slice(0, 200)); });
    if (q && Array.isArray(q.admins)) replace_('admin', q.admins.filter(function (r) { return /^[^@\s]+@[^@\s]+$/.test(String(r[0]).trim()); }).map(function (r) { return [String(r[0]).trim().toLowerCase(), String(r[1] || '').slice(0, 100)]; }));
    if (q && Array.isArray(q.codes)) replace_('code', q.codes.filter(function (r) { return /^\d+-\d+-\d+$/.test(r[0]) && cards_()[String(r[1])]; }).map(function (r) {
      return [r[0], r[1], r[2] ? time_(ms_(r[2])) : '', r[3] ? time_(ms_(r[3])) : '', String(r[4]) === '' ? '' : Math.max(0, Math.floor(num_(r[4]))), String(r[5] || '').slice(0, 100)];
    }));
    CacheService.getScriptCache().remove('conf');
  });
  return mtgAdminGet();
}
function replace_(k, rows) {
  var s = sh_(k);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent();
  rows.forEach(function (r, i) { put_(k, i, r); });
}

// ───── まえの 版（スクリプト プロパティ）からの ひっこし：エディタで 1回だけ 実行する ─────
function mtgMigrate() {
  var p = PropertiesService.getScriptProperties(), all = p.getProperties(), n = 0;
  for (var t = 1; t <= 6; t++) if (all['ghosts:' + t]) JSON.parse(all['ghosts:' + t]).forEach(function (g) { add_('ghost', ghostRow_(g)); n++; });
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('deck:') === 0) { var r = JSON.parse(all[k]), n2 = r.n || [0, 0]; add_('deck', [k.slice(5), r.s || 0, n2[0], n2[1], r.p || '', time_(r.u || Date.now())]); n++; }
    var m = /^raid:([^:]+):score$/.exec(k);
    if (m) { var s = JSON.parse(all[k]); Object.keys(s.f).forEach(function (f) { add_('raid', [m[1], '陣営', f, s.f[f]]); }); Object.keys(s.c).forEach(function (c) { add_('raid', [m[1], '統率者', c, s.c[c]]); }); n++; }
    m = /^raid:([^:]+):g:(\w+)$/.exec(k);
    if (m) { var def = JSON.parse(all['raid:' + m[1] + ':def'] || '{}'); JSON.parse(all[k]).forEach(function (g) { add_('raidg', [m[1], m[2], g.i, g.c, JSON.stringify(g.d), g.n[0], g.n[1], time_(g.u), def[g.i] || 0, '1']); n++; }); }
  });
  Logger.log('ひっこした 数：' + n + '（うまく いったら スクリプト プロパティの ghosts: deck: raid: rank は けして よい）');
}

// ───── ゲーム本体を 最新に する（GitHub → スプレッドシート）─────
// 開発モードの ボタンで、Google の サーバーが 公開リポジトリから gas/index.html と gas/cards.json を とって「ゲーム本体」シートに おく
// iPad は GitHub に つながらない（学校の フィルターでも だいじょうぶ）。Code.gs（サーバーの しくみ）が かわった ときだけ clasp push が いる
var REPO = 'shimpseguchi-jpg/math-gathering', GAME_DIR = 'gas/';
var CHUNK_CACHE = 30000; // キャッシュ 1つの 大きさ（上限 100KB。日本語も あるので 小さめ）
// とって ある ゲーム本体（clasp で 上げた ものの ほうが 新しければ ''。そのときは ファイルの ほうを つかう）
function fresh_(any) { var m = gameMeta_(); return m && (any || m.built > BUILT) ? m : null; }
function game_(any) {
  var meta = fresh_(any);
  if (!meta) return { html: '' };
  var c = CacheService.getScriptCache(), keys = [];
  for (var i = 0; i < (meta.parts || 0); i++) keys.push('game:' + meta.sha + ':' + i);
  var got = keys.length ? c.getAll(keys) : {};
  if (keys.length && keys.every(function (k) { return k in got; })) return { html: keys.map(function (k) { return got[k]; }).join('') };
  var html = gameRows_().map(function (r) { return str_(r[0]); }).join(''), put = {};
  for (var k = 0, j = 0; k < html.length; k += CHUNK_CACHE, j++) put['game:' + meta.sha + ':' + j] = html.slice(k, k + CHUNK_CACHE);
  try { c.putAll(put, 21600); meta.parts = Object.keys(put).length; PropertiesService.getScriptProperties().setProperty('GAME_META', JSON.stringify(meta)); } catch (err) { /* キャッシュ できなくても シートから よめる */ }
  return { html: html };
}
// カードの 一覧と 弾（デッキの チェック・せってい）。GitHub から とった ほうが 新しければ そちら
var DATA_ = null;
function data_() {
  if (DATA_) return DATA_;
  var meta = fresh_();
  if (!meta) return (DATA_ = { cards: CARDS, sets: SET_IDS });
  var c = CacheService.getScriptCache(), cj = c.get('cards:' + meta.sha);
  if (!cj) { cj = gameRows_().map(function (r) { return str_(r[1]); }).join(''); try { c.put('cards:' + meta.sha, cj, 21600); } catch (err) { /* おおきすぎ */ } }
  var cd = JSON.parse(cj);
  return (DATA_ = { cards: cd.cards, sets: cd.sets });
}
function gameRows_() { var s = sh_('game'), n = s.getLastRow(); return n < 2 ? [] : s.getRange(2, 1, n - 1, 2).getValues(); }
function gameMeta_() { var v = PropertiesService.getScriptProperties().getProperty('GAME_META'); return v ? JSON.parse(v) : null; }
function cards_() { return data_().cards; }
function sets_() { return data_().sets; }
function fetch_(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'mathgathering-gas' } });
  if (res.getResponseCode() !== 200) throw new Error('GitHub から とれなかった（' + res.getResponseCode() + '）：' + url);
  return res.getContentText('UTF-8');
}
// 開発モードの「ゲームを 最新に する」→ { at, sha, branch, size, built }
function mtgAdminUpdate() {
  needAdmin_();
  var branch = String(conf_()['読みこみ元'] || 'main').trim();
  var sha = branch;
  try { sha = JSON.parse(fetch_('https://api.github.com/repos/' + REPO + '/commits/' + encodeURIComponent(branch))).sha || branch; } catch (err) { /* API が だめでも ブランチ名で とる */ }
  var base = 'https://raw.githubusercontent.com/' + REPO + '/' + sha + '/' + GAME_DIR;
  var html = fetch_(base + 'index.html'), cj = fetch_(base + 'cards.json'), cd = JSON.parse(cj);
  var m = /<!--mtg-built:(\d+) server:(\w*)-->/.exec(html);
  if (!m || html.indexOf('pack-js') < 0 || !cd.cards) throw new Error('ゲーム本体の ファイルが おかしい');
  if (m[2] !== SERVER_VER || cd.server !== SERVER_VER) throw new Error('サーバー（Code.gs）が かわって います。さきに 新しい Code.gs を clasp push して、デプロイを 新バージョンに して ください');
  var built = Number(m[1]);
  withLock_(function () {
    var s = sh_('game'), rows = [], n = Math.max(Math.ceil(html.length / SAVE_CELL), Math.ceil(cj.length / SAVE_CELL));
    for (var i = 0; i < n; i++) rows.push([html.slice(i * SAVE_CELL, (i + 1) * SAVE_CELL), cj.slice(i * SAVE_CELL, (i + 1) * SAVE_CELL)]);
    if (s.getMaxRows() < n + 1) s.insertRowsAfter(s.getMaxRows(), n + 1 - s.getMaxRows());
    if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 2).clearContent();
    s.getRange(2, 1, n, 2).setNumberFormat('@').setValues(rows);
    var meta = { at: Date.now(), sha: String(sha).slice(0, 40), branch: branch, size: html.length, built: built, parts: 0 };
    PropertiesService.getScriptProperties().setProperty('GAME_META', JSON.stringify(meta));
    DATA_ = null;
  });
  return gameInfo_();
}
// いま 出して いる ゲームの 版 → { from: 'github'|'file', at, sha, branch, built }
function gameInfo_() {
  var meta = fresh_();
  if (meta) return { from: 'github', at: meta.at, sha: meta.sha, branch: meta.branch, built: meta.built };
  return { from: 'file', built: BUILT, branch: String(conf_()['読みこみ元'] || '') };
}
