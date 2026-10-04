// 角色、怪兽、地图配置

export const HEROES = [
  {
    id: 'ultraman',
    name: '初代奥特曼',
    title: '光之巨人 · 斯派修姆',
    desc: '均衡型。斯派修姆光线笔直贯穿敌人。',
    colors: { body: 0xd6d9df, main: 0xd0202a, accent: 0xd6d9df, chest: 0xd6d9df, eye: 0xfff6c8 },
    crest: 'fin',
    stats: { hp: 100, atk: 10, speed: 1.0 },
    special: { name: '斯派修姆光线', kind: 'beam', color: 0x9fe8ff, core: 0xffffff, width: 0.55, damage: 42, cost: 40, length: 60 },
  },
  {
    id: 'seven',
    name: '赛文奥特曼',
    title: '恒点观测员 340',
    desc: '头镖飞出后回旋，可连续命中多个敌人。',
    colors: { body: 0xb9bec8, main: 0xc8141e, accent: 0xc8141e, chest: 0xc7b16a, eye: 0xfff2b0 },
    crest: 'slugger',
    stats: { hp: 105, atk: 11, speed: 1.0 },
    special: { name: '头镖', kind: 'slugger', color: 0xe8f0ff, core: 0xffffff, damage: 30, cost: 30 },
  },
  {
    id: 'tiga',
    name: '迪迦奥特曼',
    title: '超古代的光之巨人',
    desc: '敏捷型。哉佩利敖光线威力巨大但耗能高。',
    colors: { body: 0xcfd3db, main: 0xc81e2a, accent: 0x5b2a8c, chest: 0xc9a54a, eye: 0xfff6d8 },
    crest: 'tiga',
    stats: { hp: 90, atk: 10, speed: 1.15 },
    special: { name: '哉佩利敖光线', kind: 'beam', color: 0xffe08a, core: 0xffffff, width: 0.75, damage: 60, cost: 50, length: 65 },
  },
  {
    id: 'zero',
    name: '赛罗奥特曼',
    title: '赛文之子 · 宇宙最强',
    desc: '攻速型。双头镖 + 集束射线。贝利亚的宿敌！',
    colors: { body: 0xc9ced8, main: 0x1d4fd6, accent: 0xd31e2a, chest: 0xc9ced8, eye: 0xfff3b0 },
    crest: 'zero',
    stats: { hp: 110, atk: 12, speed: 1.1 },
    special: { name: '集束射线', kind: 'beam', color: 0xffd23a, core: 0xfff8e0, width: 0.9, damage: 52, cost: 45, length: 60, sluggers: true },
  },
  {
    id: 'geed',
    name: '捷德奥特曼',
    title: '贝利亚之子 · 命运反抗者',
    desc: '力量型。生命与攻击最高，速度稍慢。',
    colors: { body: 0x3a3f4e, main: 0xc81e2a, accent: 0x1a1d26, chest: 0x9aa0ad, eye: 0x7fe4ff },
    crest: 'geed',
    stats: { hp: 125, atk: 13, speed: 0.95 },
    special: { name: '莱斯平射线', kind: 'beam', color: 0xff3a6a, core: 0x9ad8ff, width: 0.8, damage: 55, cost: 45, length: 60, swirl: true },
  },
];

// 四座光之塔 + 守护怪兽
export const TOWERS = [
  { id: 'forest', name: '翠林之塔', x: -380, z: 40, biome: '森林', kaiju: 'gomora' },
  { id: 'desert', name: '烈砂之塔', x: 390, z: 60, biome: '沙漠', kaiju: 'redking' },
  { id: 'lake', name: '镜湖之塔', x: 40, z: 360, biome: '湖畔', kaiju: 'eleking' },
  { id: 'snow', name: '霜峰之塔', x: -300, z: -300, biome: '雪山', kaiju: 'zetton' },
];

export const KAIJU = {
  gomora: {
    name: '古代怪兽 哥莫拉', hp: 260, atk: 14, scale: 1.0, speed: 7,
    color: 0x7a5a3a, belly: 0xc8a46e, horn: 0xe8dcc0, eye: 0xffd040,
    horns: 'crescent', ranged: null, charge: true,
  },
  redking: {
    name: '怪兽之王 雷德王', hp: 300, atk: 16, scale: 1.1, speed: 6,
    color: 0xb08a4a, belly: 0xd8c08a, horn: 0x5a4020, eye: 0xff5020,
    horns: 'small', ranged: 'rock', charge: false, slam: true,
  },
  eleking: {
    name: '宇宙怪兽 艾雷王', hp: 280, atk: 14, scale: 1.0, speed: 7.5,
    color: 0xf2f0e6, belly: 0xf2f0e6, horn: 0xf2f0e6, eye: 0xffe060, spots: 0x1a1a1a,
    horns: 'antenna', ranged: 'electric', charge: false,
  },
  zetton: {
    name: '宇宙恐龙 杰顿', hp: 340, atk: 17, scale: 1.05, speed: 6.5,
    color: 0x1b1b22, belly: 0x2a2a34, horn: 0x1b1b22, eye: 0xffe23a, lights: 0xffe23a,
    horns: 'zetton', ranged: 'fireball', charge: false, teleport: true,
  },
};

export const CASTLE = { x: 0, z: -470, r: 62 };
export const WORLD = { half: 600, water: 0 };
