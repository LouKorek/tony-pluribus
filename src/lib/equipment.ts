// The equipment catalogue of an academy: codes the coach picks from, with English and Kinyarwanda names.
// A coach who has something that is not here adds it as "custom:<name>" – the exception, not the rule.

export interface EquipmentDef { code: string; en: string; rw: string; unit?: 'pairs' | 'sets' }
export interface EquipmentGroup { code: string; en: string; rw: string; items: EquipmentDef[] }

export const EQUIPMENT_GROUPS: EquipmentGroup[] = [
  { code: 'balls', en: 'Balls', rw: 'Imipira', items: [
    { code: 'ball_s3', en: 'Balls size 3', rw: 'Imipira ingano 3' },
    { code: 'ball_s4', en: 'Balls size 4', rw: 'Imipira ingano 4' },
    { code: 'ball_s5', en: 'Balls size 5', rw: 'Imipira ingano 5' },
    { code: 'ball_futsal', en: 'Futsal balls', rw: 'Imipira ya futsal' },
    { code: 'ball_pump', en: 'Ball pump', rw: 'Pompo' },
    { code: 'ball_bag', en: 'Ball bag / net', rw: "Umufuka w'imipira" },
  ] },
  { code: 'goals', en: 'Goals and pitch', rw: 'Izamu n\'ikibuga', items: [
    { code: 'goal_full', en: 'Full-size goals (11v11)', rw: 'Izamu nini (11v11)' },
    { code: 'goal_7', en: '7-a-side goals', rw: 'Izamu za 7 kuri 7' },
    { code: 'goal_5', en: '5-a-side goals', rw: 'Izamu za 5 kuri 5' },
    { code: 'goal_mini', en: 'Mini / pop-up goals', rw: 'Izamu nto' },
    { code: 'goal_nets', en: 'Goal nets', rw: 'Urushundura rw\'izamu' },
    { code: 'corner_flags', en: 'Corner flags', rw: 'Amabendera y\'inguni' },
    { code: 'line_marker', en: 'Line marker / lime', rw: 'Igishushanyo cy\'imirongo' },
  ] },
  { code: 'training', en: 'Training equipment', rw: 'Ibikoresho by\'imyitozo', items: [
    { code: 'cones', en: 'Cones', rw: 'Utubumbe' },
    { code: 'marker_discs', en: 'Marker discs', rw: 'Udusahani tw\'ibimenyetso' },
    { code: 'bibs', en: 'Bibs', rw: 'Amakoti yo kwitoza' },
    { code: 'poles', en: 'Training poles / slalom', rw: 'Inkoni z\'imyitozo' },
    { code: 'ladder', en: 'Agility ladder', rw: 'Urwego rw\'imyitozo' },
    { code: 'hurdles', en: 'Hurdles', rw: 'Inzitizi' },
    { code: 'rings', en: 'Agility rings / hoops', rw: 'Impeta z\'imyitozo' },
    { code: 'mannequins', en: 'Mannequins / dummies', rw: 'Ibishushanyo by\'abakinnyi' },
    { code: 'rebounder', en: 'Rebounder / wall net', rw: 'Urushundura rusubiza umupira' },
    { code: 'resistance_bands', en: 'Resistance bands', rw: 'Imigozi y\'imyitozo' },
    { code: 'skipping_ropes', en: 'Skipping ropes', rw: 'Imigozi yo gusimbuka' },
    { code: 'medicine_balls', en: 'Medicine balls', rw: 'Imipira iremereye' },
  ] },
  { code: 'kit', en: 'Kit and clothing', rw: 'Imyambaro', items: [
    { code: 'kit_match', en: 'Match kits (sets)', rw: 'Imyambaro y\'imikino (seti)', unit: 'sets' },
    { code: 'training_shirts', en: 'Training shirts', rw: 'Amashati yo kwitoza' },
    { code: 'shorts', en: 'Shorts', rw: 'Amakabutura' },
    { code: 'socks', en: 'Socks (pairs)', rw: 'Amasogisi (pairs)', unit: 'pairs' },
    { code: 'boots', en: 'Football boots (pairs)', rw: 'Inkweto z\'umupira (pairs)', unit: 'pairs' },
    { code: 'shin_guards', en: 'Shin guards (pairs)', rw: 'Ibirinda amaguru (pairs)', unit: 'pairs' },
    { code: 'gk_gloves', en: 'Goalkeeper gloves (pairs)', rw: 'Udukoko tw\'abanyezamu (pairs)', unit: 'pairs' },
    { code: 'gk_jerseys', en: 'Goalkeeper jerseys', rw: 'Amashati y\'abanyezamu' },
    { code: 'rain_jackets', en: 'Rain jackets', rw: 'Amakoti y\'imvura' },
    { code: 'captain_armband', en: 'Captain armband', rw: 'Akabendera ka kapiteni' },
  ] },
  { code: 'health', en: 'Health and water', rw: 'Ubuzima n\'amazi', items: [
    { code: 'first_aid', en: 'First-aid kit', rw: 'Agasanduku k\'ubutabazi' },
    { code: 'ice_packs', en: 'Ice packs / cold spray', rw: 'Urubura / spray ikonje' },
    { code: 'stretcher', en: 'Stretcher', rw: 'Ingobyi' },
    { code: 'water_jerrycans', en: 'Water jerrycans', rw: 'Amajerekani y\'amazi' },
    { code: 'water_bottles', en: 'Water bottles', rw: 'Amacupa y\'amazi' },
    { code: 'bottle_carrier', en: 'Bottle carrier', rw: 'Igitwaza amacupa' },
  ] },
  { code: 'coaching', en: 'Coaching tools', rw: 'Ibikoresho by\'umutoza', items: [
    { code: 'whistle', en: 'Whistle', rw: 'Ifirimbi' },
    { code: 'stopwatch', en: 'Stopwatch', rw: 'Isaha y\'imyitozo' },
    { code: 'tactics_board', en: 'Tactics board', rw: 'Ikibaho cy\'amayeri' },
    { code: 'referee_cards', en: 'Referee cards', rw: 'Amakarita y\'umusifuzi' },
    { code: 'measuring_tape', en: 'Measuring tape', rw: 'Metero' },
    { code: 'scale', en: 'Weighing scale', rw: 'Umunzani' },
    { code: 'storage_box', en: 'Storage box / trunk', rw: 'Isanduku yo kubikamo' },
    { code: 'speaker', en: 'Speaker / megaphone', rw: 'Indangururamajwi' },
  ] },
]

export const EQUIPMENT_ITEMS: EquipmentDef[] = EQUIPMENT_GROUPS.flatMap(g => g.items)
const byCode = new Map(EQUIPMENT_ITEMS.map(i => [i.code, i]))

export const isCustom = (code: string) => code.startsWith('custom:')
export const customCode = (label: string) => 'custom:' + label.trim().toLowerCase().replace(/[^a-z0-9À-￿]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

/** Display name of an item: from the catalogue in the language asked, or the coach's own label. */
export function equipmentName(code: string, lang: 'en' | 'rw' = 'en', label?: string | null): string {
  if (isCustom(code)) return label || code.slice(7).replace(/-/g, ' ')
  const d = byCode.get(code)
  return d ? (lang === 'rw' ? d.rw : d.en) : code.replace(/_/g, ' ')
}
export const equipmentGroupOf = (code: string) => EQUIPMENT_GROUPS.find(g => g.items.some(i => i.code === code))
