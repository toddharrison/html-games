// Drawn sprites (SPEC 12.1): small grids of palette colours, one character per pixel, built into canvases
// when the game starts. A form that can be drawn, reviewed in a diff, and changed like code. Each sprite
// has its own legend from characters to palette colours; '.' is transparent. The survivor's legend has
// slots (S skin, H hair, C clothes, P trousers) filled from the protagonist's looks.

import { PALETTE as P } from './palette.ts';

export interface SpriteDef {
  legend: Record<string, string>;
  rows: string[];
}

const TREE = { d: P.pine, g: P.pineLight, t: P.bark, s: '#16261b' };

export const SPRITES: Record<string, SpriteDef> = {
  conifer: {
    legend: TREE,
    rows: [
      '.......d........',
      '......dgd.......',
      '......dgd.......',
      '.....dggdd......',
      '.....dgddd......',
      '....ddgdddd.....',
      '....dggddsd.....',
      '...ddgdddddd....',
      '...dggddddsd....',
      '..ddgddddddds...',
      '..dggdddddddsd..',
      '.ddgdddddddddss.',
      '.ddddddddddsssd.',
      '...ssss.tssss...',
      '.......tt.......',
      '......tttt......',
    ],
  },
  stunted: {
    legend: TREE,
    rows: [
      '................',
      '................',
      '................',
      '................',
      '.........d......',
      '........dgd.....',
      '.......dgdd.....',
      '......ddgdds....',
      '.....dgddddd....',
      '....ddgdddsdd...',
      '...ddgddddddss..',
      '....sss.tsss....',
      '........t.......',
      '.......tt.......',
      '................',
      '................',
    ],
  },
  aspen: {
    legend: { a: P.aspen, b: '#8a8344', l: '#c9c070', w: P.cream, k: P.ink },
    rows: [
      '.....aaaa.......',
      '...aalaaaab.....',
      '..aallaaaaab....',
      '..alaaaabaab....',
      '.aaaaaabaaabb...',
      '.alaaaaaaaaab...',
      '.aaaabaaaaabb...',
      '..aaaaaaabbb....',
      '...abbaabbb.....',
      '.....bbwbb......',
      '.......w........',
      '.......wk.......',
      '.......w........',
      '.......wk.......',
      '......www.......',
      '................',
    ],
  },
  snag: {
    legend: { f: P.fog, s: P.stone, k: P.ink },
    rows: [
      '.....f....f.....',
      '.....f...f......',
      '......f.ff......',
      '......fkf.......',
      '......fks.......',
      '......fks.......',
      '.....ffks.......',
      '......fks.......',
      '......fks.......',
      '......fks.......',
      '......fks.......',
      '......fkss......',
      '.....ffkss......',
      '.....fffsss.....',
      '....ffssssss....',
      '................',
    ],
  },
  boulder: {
    legend: { s: P.stone, f: P.fog, p: P.pale, k: P.slate, i: P.ink },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....ffff.......',
      '....fppfsss.....',
      '...fpffsssss....',
      '..ffffsssssks...',
      '..fffssssssks...',
      '..ffsssssskks...',
      '..fssssssskkk...',
      '..sssssskkkkk...',
      '...kkkkkkkkki...',
      '....iiiiiiii....',
      '................',
    ],
  },
  bush: {
    legend: { b: P.scrub, m: P.meadow, r: P.ember, t: P.bark },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....b...b......',
      '...b.b.bbb.b....',
      '...bbmbbmbbb....',
      '..bmbbrbbmbbb...',
      '..bbmbbbbbbrb...',
      '...bbbbmbbbb....',
      '..b.bbbbbbb.b...',
      '....t.t..t......',
      '................',
      '................',
      '................',
    ],
  },
  berries: {
    legend: { d: P.forest, g: P.meadow, x: '#X', t: P.bark },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '.....ddddd......',
      '...ddgdxddd.....',
      '..ddxgddddxd....',
      '..dgddxdgddd....',
      '.ddddgdddxddd...',
      '.dxdddgxddgdd...',
      '.ddgdddddddxd...',
      '..ddxddgdxdd....',
      '...ddddddddd....',
      '.....t..t.......',
      '................',
      '................',
    ],
  },
  log: {
    legend: { w: P.wood, l: '#9a7d58', b: P.bark, r: P.cream },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.lllllllllllll..',
      'wwwwwwwwwwwwwbr.',
      'wwbwwwwwbwwwwbrr',
      'wwwwwbwwwwwwwbr.',
      '.bbbbbbbbbbbbb..',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  crash: {
    legend: { w: P.pale, h: P.snow, k: P.ink, s: P.stone, r: P.red, z: P.slate },
    rows: [
      '................',
      '................',
      '................',
      '..........s.....',
      '.........ss.....',
      '...hhhhhhhhhh...',
      '..hwwwwwwwwwwh..',
      '.hwkkwkkwkkwwwh.',
      '.hwkkwkkwkkwwwh.',
      '.hrrrrrrrrrrrrh.',
      '.hwwwwwwwwwwwwz.',
      '..zwwwwwwwwwzz..',
      '...zzzzzzzzzz...',
      '................',
      '................',
      '................',
    ],
  },
  tail: {
    legend: { w: P.pale, h: P.snow, r: P.red, z: P.slate },
    rows: [
      '................',
      '..........hh....',
      '.........hwh....',
      '........hwwh....',
      '.......hrrwh....',
      '......hwwwwh....',
      '.....hwwwwwh....',
      '....hwwwwwwh....',
      '..hhwwwwwwwhh...',
      '.hwwwwwwwwwwwh..',
      '.hwwwwwwwwwwwz..',
      '..zzzzzzzzzzz...',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  bed: {
    legend: { d: P.pine, g: P.pineLight, b: P.bark },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '..gdgdgdgdgdg...',
      '.gddgddgddgddg..',
      '.dgdgdgdgdgdgd..',
      '.gddgddgddgddg..',
      '..dgdgdgdgdgd...',
      '..b.........b...',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  wall: {
    legend: { w: P.wood, b: P.bark, l: '#9a7d58' },
    rows: [
      '..b...b...b...b.',
      '.lbwlwbwlwbwlwb.',
      '..bwlwbwlwbwlwb.',
      '.lbwlwbwlwbwlwb.',
      '..bwlwbwlwbwlwb.',
      '.lbwlwbwlwbwlwb.',
      '..bwlwbwlwbwlwb.',
      '..b...b...b...b.',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  'lean-to': {
    legend: { d: P.pine, g: P.pineLight, b: P.bark, k: P.ink },
    rows: [
      '................',
      '..b.............',
      '..bb............',
      '..bgb...........',
      '..bddb..........',
      '..bgdgb.........',
      '..bddddb........',
      '..bgdgdgb.......',
      '..bdddddbb......',
      '..bgdgdgdgb.....',
      '..bddddddddb....',
      '..bgdgdgdgdgb...',
      '..bkkkkkkkkkkb..',
      '..b..........b..',
      '................',
      '................',
    ],
  },
  woodpile: {
    legend: { w: P.wood, b: P.bark, r: P.cream, s: '#5a4634' },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '...ssssssssss...',
      '..ssssssssssss..',
      '..b..........b..',
      '..brrbrrbrrb.b..',
      '..bwwbwwbwwbwb..',
      '..brrbrrbrrbrb..',
      '..bwwbwwbwwbwb..',
      '..brrbrrbrrbrb..',
      '..b..........b..',
      '................',
      '................',
      '................',
    ],
  },
  cache: {
    legend: { c: P.cream, b: P.bark, w: P.wood },
    rows: [
      '.......c........',
      '.......c........',
      '.......c........',
      '.......c........',
      '.......c........',
      '......bwb.......',
      '.....bwwwb......',
      '.....bwwwb......',
      '......bbb.......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  signal: {
    legend: { w: P.wood, b: P.bark, d: P.pine, g: P.pineLight },
    rows: [
      '................',
      '................',
      '.......g........',
      '......gdg.......',
      '.....gdbdg......',
      '....gdbwbdg.....',
      '....dbwbwbd.....',
      '...gbwbwbwbg....',
      '...dbwbwbwbd....',
      '..gbwbwbwbwbg...',
      '..dwbwbwbwbwd...',
      '..bwbwbwbwbwb...',
      '..wbwbwbwbwbw...',
      '................',
      '................',
      '................',
    ],
  },
  outcrop: {
    legend: { b: '#X', m: '#Y', k: P.ink, s: P.slate },
    rows: [
      '................', '................', '................', '................',
      '......bbbb......', '....bbmbbbbb....', '...bbbbbmbbbb...', '..bmbbbbbbbmbb..', '..bbbbmbbbbbbbs.',
      '.bbbbbbbbmbbbbs.', '.bbmbbbbbbbbmss.', '.bbbbbbmbbbbsss.', '..sssssssssssk..', '...kkkkkkkkkk...', '................', '................',
    ],
  },
  overhang: {
    legend: { l: P.fog, r: P.stone, d: P.slate, k: P.ink },
    rows: [
      'llllllllllllllll', 'lrlrrlrrrlrrlrrl', 'rrrrrrrrrrrrrrrr', 'rrdrrrrdrrrrdrrr', 'rrrrrdrrrrrrrrdr', 'rdrrrrrrrdrrrrrr',
      'rrrrrrdrrrrrdrrr', 'rrdrrrrrrrrrrrrr', 'drrrrdrrrdrrrdrr', 'rrrrrrrrrrrrrrrr', 'dddddddddddddddd', 'kkkkkkkkkkkkkkkk',
      'kkkkkkkkkkkkkkkk', '.k.k.k.k.k.k.k.k', '................', '................',
    ],
  },
  herb: {
    legend: { x: '#X', g: P.forest, w: P.snow },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '.....w....w.....', '....xxx..xxx....', '...x.x.xx.x.x...', '....xxgxxgxx....', '..xx.xgggx.xx...', '...xxxgxgxxx....',
      '.....xxgxx......', '......ggg.......', '................', '................',
    ],
  },
  bulb: {
    legend: { g: P.meadowLight, d: P.meadow, x: '#X' },
    rows: [
      '................', '................', '................', '.....g....g.....', '.....g...g......', '......g..g...g..',
      '..g...g.g...g...', '...g..ggg..g....', '....g.ggg.g.....', '.....dgggd......', '......ddd.......', '.....xxxxx......',
      '....xxxxxxx.....', '.....xxxxx......', '................', '................',
    ],
  },
  greens: {
    legend: { x: '#X', d: P.forest },
    rows: [
      '................', '................', '................', '................', '................', '......xx........',
      '..xx..xxx..xx...', '.xxxx.xdx.xxxx..', '..xxxxxdxxxxx...', '...xxdxdxdxx....', '.xxxxxdddxxxxx..', '..xxxxxdxxxxx...',
      '....xxxdxxx.....', '......ddd.......', '................', '................',
    ],
  },
  mushroom: {
    legend: { x: '#X', y: '#Y', c: P.cream, k: P.bark },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '..........xx....', '...xxxx..xyxx...', '..xyxxxx.xxxx...', '..xxxxyx..cc....', '....cc....cc....', '....cc....cc....',
      '...kccck..kk....', '..kkkkkkkk......', '................', '................',
    ],
  },
  bones: {
    legend: { c: P.cream, s: P.pale, k: P.stone },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '................', '...cc.......cc..', '....cccccccc....', '...cc.......cc..', '.....s..s.......', '..csc.cskc.sc...',
      '...s..s..s..s...', '..ccc.ccc.ccc...', '................', '................',
    ],
  },
  arch: {
    legend: { r: P.stone, l: P.fog, d: P.slate },
    rows: [
      '................', '...llllllllll...', '..lrrrrrrrrrrl..', '.lrrrdrrrrdrrrl.', '.rrrr......rrrr.', '.rrd........drr.',
      '.rrr........rrr.', '.rdr........rdr.', '.rrr........rrr.', '.rrr........rrr.', '.drr........rrd.', '.rrr........rrr.',
      'drrrd......drrrd', 'dddd........dddd', '................', '................',
    ],
  },
  beaverDam: {
    legend: { w: P.wood, b: P.bark, l: '#9a7d58', m: P.soil },
    rows: [
      '................', '................', '................', '................', '................',
      '.l....l...l...l.', 'lwlwbwlwbwlwlwbl', 'wbwlwbwlwbwlwbwl', 'bwmwlwmwbwmwlwmw', 'mmwbmwmbwmbmwmbm', 'mmmmmmmmmmmmmmmm',
      '................', '................', '................', '................', '................',
    ],
  },
  carcass: {
    legend: { b: P.bark, d: '#4a3624', c: P.cream },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '................', '.....bbbbbbbb...', '...bbbcbcbcbbbd.', '..bbdbcbcbcbbbdd', '..bbbbbbbbbbbb..', '...b..b...b..b..',
      '................', '................', '................', '................',
    ],
  },
  midden: {
    legend: { s: P.stone, l: P.fog, k: P.ink, w: P.wood, c: P.cream },
    rows: [
      '................', '................', '................', '................', '......ss........',
      '....sslsss......', '...sssslsss.....', '..sslkkkksss....', '..sswkcwkwss....', '.sssskkkksssss..', '.sslsssssslsss..',
      '..ssssssssssss..', '...kkkkkkkkkk...', '................', '................', '................',
    ],
  },
  /** A bear's den: earth dug out from under a rock, a dark mouth, the spoil heaped in front. */
  den0: {
    legend: { s: P.stone, l: P.fog, k: P.ink, e: P.soil, d: '#4a3d2f' },
    rows: [
      '................', '................', '................', '....sslss.......', '..sssssslsss....',
      '.ssslsssssssss..', 'ssssskkkkkssss..', 'sssskkkkkkksss..', '.sskkkkkkkkkss..', '..dkkkkkkkkkd...',
      '.ddeekkkkkeedd..', '.deeeeeeeeeeed..', '..ddeeeeeeedd...', '....dddddd......', '................', '................',
    ],
  },
  /** A cougar's lair: a dry shelf under a slab of rock, dark beneath, a bone at the edge. */
  den1: {
    legend: { s: P.stone, l: P.fog, k: P.ink, c: P.cream, t: P.talus },
    rows: [
      '................', '................', '................', '................', '..llllllllll....',
      '.ssssssssssssl..', 'sssssssssssssss.', 'kkkkkkkkkkkkksss', 'kkkkkkkkkkkkkss.', '.tttttttttttt...',
      '..tttcctttttt...', '...tttttttt.....', '................', '................', '................', '................',
    ],
  },
  /** Marmot burrows: holes among the stones, each with a fan of earth. */
  den2: {
    legend: { s: P.stone, k: P.ink, e: P.soil, l: P.fog },
    rows: [
      '................', '................', '..ss............', '.slss.......ss..', '..kk.......slss.',
      '.eeke.......kk..', 'eeeeee.....ekke.', '..ee.....eeeeee.', '.......ss...ee..', '......slss......',
      '.......kk.......', '.....eekkee.....', '....eeeeeeee....', '......eeee......', '................', '................',
    ],
  },
  plane: {
    legend: { w: '#d8dcdc', g: '#8a9094', r: P.red },
    rows: [
      '................', '................', '................', '................', '................',
      '.......ww.......', '.......ww.......', 'g.....wwww......', 'gwwwwwwwwwwwwr..', 'g.....wwww......',
      '.......ww.......', '.......ww.......', '................', '................', '................', '................',
    ],
  },
  stash: {
    legend: { b: P.bark, w: P.wood, c: P.cream },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....ww.........',
      '....wwbbc.......',
      '....wbbbbcw.....',
      '.....bbbbww.....',
      '......bbb.......',
      '................',
      '................',
    ],
  },
};


/** Animals (SPEC 12.1: 2-frame animations; the second frame is the first lifted a pixel). */
export const ANIMAL_SPRITES: Record<string, SpriteDef> = {
  hare: {
    legend: { h: '#8a7a64', e: '#a89880', k: P.ink, w: P.cream },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '...........ee...', '...........ee...', '..........hhh...', '.....hhhhhhhhk..', '....hhhhhhhhhh..', '...whhhhhhhhh...',
      '....hhhhhhhh....', '....hh....hh....', '................', '................',
    ],
  },
  grouse: {
    legend: { b: '#6e5a44', m: '#a08868', k: P.ink, y: '#b09050' },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '................', '.........bb.....', '........bkbb....', '...bbbbbbbbb....', '..bbmbmbmbbb....', '...bbmbmbbb.....',
      '....bbbbbbb.....', '.....y..y.......', '................', '................',
    ],
  },
  marmot: {
    legend: { m: '#8a6a40', l: '#b08a50', k: P.ink },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '.......mm.......', '......mkmm......', '.....mmlmmm.....', '.....mllllmm....', '....mmllllmm....', '....mmmmmmmm....',
      '.....mm..mm.....', '................', '................', '................',
    ],
  },
  jay: {
    legend: { b: '#4b6a9a', d: '#2e4466', k: P.ink, w: P.cream, y: '#3a3a3a' },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '................', '........dd......', '.......dkbw.....', '..ddbbbbbb......', '...dbbbbb.......', '.....bbb........',
      '.....y.y........', '................', '................', '................',
    ],
  },
  packrat: {
    legend: { r: '#7a7268', l: '#9a9288', k: P.ink, t: '#5a544c' },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '................', '................', '..........rr....', '......rrrrrkr...', '.....rlllllrr...', 'tttt.rrrrrrr....',
      '......r...r.....', '................', '................', '................',
    ],
  },
  porcupine: {
    legend: { q: '#3a3228', w: '#d8d0b8', k: P.ink, f: '#5a4a38' },
    rows: [
      '................', '................', '................', '................', '................',
      '....w..w..w.....', '...qwqqwqqwq....', '..qqqwqqwqqqq...', '..qwqqqwqqwqqf..', '.qqqqwqqqqqqfk..', '.qqwqqqwqqqqff..',
      '..qqqqqqqqqq....', '...f..f..f.f....', '................', '................', '................',
    ],
  },
  bear: {
    legend: { b: '#1c1a1c', m: '#3a3430', k: '#6a5040' },
    rows: [
      '................', '................', '................', '................',
      '..........bb.b..', '...bbbbbbbbbbbb.', '..bbbbbbbbbbbbbk', '.bbbbmbbbbbbbbkk', '.bbbbbbbmbbbbbb.', '.bbbbbbbbbbbbbb.',
      '.bbbbbbbbbbbbb..', '..bbb..bbb..bb..', '..bb...bb...bb..', '..bb...bb...bb..', '................', '................',
    ],
  },
  elk: {
    legend: { e: '#7a5a3a', d: '#4a3422', a: '#c8b890', w: P.cream },
    rows: [
      '...........a.a..', '..........aa.aa.', '...........aaa..', '...........ddd..', '...........dddd.',
      '...eeeeeeeeedd..', '..weeeeeeeeed...', '...eeeeeeeeee...', '...eeeeeeeeee...', '...ee.e...e.ee..',
      '...dd.d...d.dd..', '...dd.d...d.dd..', '...d..d...d..d..', '................', '................', '................',
    ],
  },
  cougar: {
    legend: { c: '#a8885a', l: '#c8a878', k: P.ink, t: '#6a5236' },
    rows: [
      '................', '................', '................', '................', '................', '................',
      '............cc..', '...........ccck.', '..ccccccccccccc.', '.tcclllllllccc..', 't..cccccccccc...', 't..cc.c...c.cc..',
      '...c..c...c..c..', '................', '................', '................',
    ],
  },
  goat: {
    legend: { w: '#e8e6dc', g: '#c8c4b4', k: P.ink, h: '#3a3a3a' },
    rows: [
      '................', '................', '................', '................', '..........h.....', '..........hh....',
      '..........www...', '..........wkw...', '...wwwwwwwwww...', '..wwwgwwwwwww...', '..wwwwwwwgww....', '..ww.w...w.w....',
      '..gg.g...g.g....', '................', '................', '................',
    ],
  },
};

/** The survivor, facing south, north, and east (west is east mirrored), in two walking frames each. */
const PERSON_ROWS: Record<string, string[]> = {
  south0: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HSSSSH.....',
    '.....SkSSkS.....',
    '.....SSSSSS.....',
    '......SSSS......',
    '....CCCCCCCC....',
    '...CCCCCCCCCC...',
    '...SCCCCCCCCS...',
    '...SCCCCCCCCS...',
    '....CCCCCCCC....',
    '.....PPPPPP.....',
    '.....PP..PP.....',
    '.....PP..PP.....',
    '.....kk..kk.....',
  ],
  south1: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HSSSSH.....',
    '.....SkSSkS.....',
    '.....SSSSSS.....',
    '......SSSS......',
    '....CCCCCCCC....',
    '...CCCCCCCCCC...',
    '...SCCCCCCCCS...',
    '....CCCCCCCCS...',
    '....CCCCCCCC....',
    '.....PPPPPP.....',
    '.....PP..PP.....',
    '....PP....PP....',
    '....kk....kk....',
  ],
  north0: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HHHHHH.....',
    '.....HHHHHH.....',
    '.....SHHHHS.....',
    '......SSSS......',
    '....CCCCCCCC....',
    '...CCCCCCCCCC...',
    '...SCCCCCCCCS...',
    '...SCCCCCCCCS...',
    '....CCCCCCCC....',
    '.....PPPPPP.....',
    '.....PP..PP.....',
    '.....PP..PP.....',
    '.....kk..kk.....',
  ],
  north1: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HHHHHH.....',
    '.....HHHHHH.....',
    '.....SHHHHS.....',
    '......SSSS......',
    '....CCCCCCCC....',
    '...CCCCCCCCCC...',
    '...SCCCCCCCCS...',
    '...SCCCCCCCC....',
    '....CCCCCCCC....',
    '.....PPPPPP.....',
    '.....PP..PP.....',
    '....PP....PP....',
    '....kk....kk....',
  ],
  east0: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HHHSSS.....',
    '.....HHSSkS.....',
    '.....HSSSSSS....',
    '......SSSS......',
    '.....CCCCCC.....',
    '....CCCCCCCC....',
    '....CCCCCCSS....',
    '....CCCCCC......',
    '.....CCCCC......',
    '.....PPPPP......',
    '.....PP.PP......',
    '.....PP..PP.....',
    '.....kk..kk.....',
  ],
  east1: [
    '................',
    '......HHHH......',
    '.....HHHHHH.....',
    '.....HHHSSS.....',
    '.....HHSSkS.....',
    '.....HSSSSSS....',
    '......SSSS......',
    '.....CCCCCC.....',
    '....CCCCCCCC....',
    '...SCCCCCCC.....',
    '....CCCCCC......',
    '.....CCCCC......',
    '.....PPPPP......',
    '.....PPPP.......',
    '......PP........',
    '......kk........',
  ],
  asleep: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..HHH...........',
    '.HHSSSCCCCCCPPPk',
    '.HSSSSCCCCCCPPPk',
    '..HSS.CCCCCC....',
    '................',
    '................',
    '................',
    '................',
  ],
};

export const SKIN = ['#f1d0b5', '#e0b28f', '#c68b63', '#9c6644', '#7a4a2e', '#5a3420'];
export const HAIR = ['#2b2018', '#4a3020', '#7a4b28', '#b07a3c', '#d9b36a', '#8a2f1c'];
export const SHIRT = ['#8a3b32', '#3f5f8a', '#4f7a4a', '#c09a3a', '#6a4a7a', '#b5662f', '#3a6d72', '#9a9a92'];
export const PANTS = ['#3b4458', '#4d4436', '#5a5a5a', '#2f3a2f', '#6b5a44'];

export interface Looks {
  skin: number;
  hair: number;
  hairStyle: number;
  shirt: number;
  pants: number;
}

/** The survivor's rows for a pose, with the hair style drawn in: 0 short, 1 long, 2 tied back. */
export function personSprite(looks: Looks, pose: 'south' | 'north' | 'east' | 'asleep', frame: number): SpriteDef {
  const key = pose === 'asleep' ? 'asleep' : `${pose}${frame}`;
  const rows = PERSON_ROWS[key]!.map((r) => r.split(''));
  const set = (x: number, y: number) => {
    if (rows[y]?.[x] !== undefined && (rows[y]![x] === '.' || rows[y]![x] === 'S')) rows[y]![x] = 'H';
  };
  if (pose !== 'asleep') {
    if (looks.hairStyle === 1) {
      for (let y = 2; y <= 7; y++) {
        if (pose === 'east') set(5, y);
        else {
          set(4, y);
          set(11, y);
        }
      }
    } else if (looks.hairStyle === 2) {
      if (pose === 'north') for (let y = 5; y <= 8; y++) set(7, y), set(8, y);
      else if (pose === 'east') for (let y = 3; y <= 6; y++) set(4, y);
    }
  }
  return {
    legend: {
      S: SKIN[looks.skin] ?? SKIN[0]!,
      H: HAIR[looks.hair] ?? HAIR[0]!,
      C: SHIRT[looks.shirt] ?? SHIRT[0]!,
      P: PANTS[looks.pants] ?? PANTS[0]!,
      k: P.ink,
    },
    rows: rows.map((r) => r.join('')),
  };
}

/** Draw a sprite onto a canvas context at (x, y). `swap` replaces legend colours (berry tints). */
export function paint(g: CanvasRenderingContext2D, def: SpriteDef, x = 0, y = 0, swap: Record<string, string> = {}, mirror = false): void {
  def.rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx]!;
      if (ch === '.') continue;
      const c = swap[ch] ?? def.legend[ch];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(x + (mirror ? row.length - 1 - rx : rx), y + ry, 1, 1);
    }
  });
}
