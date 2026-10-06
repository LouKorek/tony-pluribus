import { createContext, useContext, useState, type ReactNode } from 'react'

// English is the master text. The Kinyarwanda column is a first draft and needs a review by a native speaker.
const S = {
  home: ['Home', 'Ahabanza'],
  squad: ['My squad', 'Abakinnyi banjye'],
  camps: ['Camps', 'Amakambi'],
  updates: ['Updates', 'Amakuru'],
  signOut: ['Sign out', 'Sohoka'],
  coachPortal: ['Coach portal', "Urubuga rw'umutoza"],
  welcome: ['Welcome', 'Murakaza neza'],
  scoutingSeason: ['Scouting season', "Igihembwe cy'ishakisha"],
  playersInSquad: ['Players in squad', 'Abakinnyi mu ikipe'],
  submitted: ['Submitted to camps', "Boherejwe mu makambi"],
  selected: ['Selected', 'Batoranyijwe'],
  provinceRank: ['Rank in province', "Umwanya mu ntara"],
  rankOf: ['of', 'muri'],
  noRankYet: ['No selections yet', 'Nta watoranyijwe'],
  actionNeeded: ['Action needed', 'Ibikenewe gukorwa'],
  allClear: ['Nothing waiting for you right now.', 'Nta kintu gitegereje ubu.'],
  replyInvite: ['Reply to the invitation', 'Subiza ubutumire'],
  openCampsCta: ['District camps open for your players', "Amakambi y'akarere afunguye ku bakinnyi bawe"],
  seeCamps: ['See camps', 'Reba amakambi'],
  latestUpdates: ['Latest updates', 'Amakuru mashya'],
  seeAll: ['See all', 'Reba byose'],
  addPlayer: ['Add player', 'Ongeraho umukinnyi'],
  editPlayer: ['Edit player', 'Hindura umukinnyi'],
  firstName: ['First name', 'Izina bwite'],
  lastName: ['Last name', "Izina ry'umuryango"],
  birthYear: ['Birth year', "Umwaka w'amavuko"],
  birthDate: ['Date of birth', "Itariki y'amavuko"],
  optional: ['optional', "si ngombwa"],
  positions: ['Positions', 'Imyanya akinaho'],
  foot: ['Preferred foot', 'Ukuguru akoresha'],
  left: ['Left', 'Ibumoso'],
  right: ['Right', 'Iburyo'],
  both: ['Both', 'Byombi'],
  guardian: ['Parent or guardian', 'Umubyeyi cyangwa umurera'],
  guardianName: ['Guardian name', "Izina ry'umubyeyi"],
  guardianPhone: ['Guardian phone', "Telefone y'umubyeyi"],
  guardianConsent: ['The guardian agrees to the player taking part in TFEP camps', "Umubyeyi yemeye ko umukinnyi yitabira amakambi ya TFEP"],
  guardianHint: ['Needed later if the player joins the Tony squad.', 'Bizakenerwa nyuma niba umukinnyi yinjiye mu ikipe ya Tony.'],
  notes: ['Notes for TFEP', 'Ibisobanuro kuri TFEP'],
  save: ['Save', 'Bika'],
  cancel: ['Cancel', 'Reka'],
  edit: ['Edit', 'Hindura'],
  remove: ['Remove from squad', 'Kura mu ikipe'],
  removeConfirm: ['Remove this player from your squad?', 'Ukuye uyu mukinnyi mu ikipe yawe?'],
  yesRemove: ['Yes, remove', 'Yego, kuramo'],
  search: ['Search players', 'Shakisha abakinnyi'],
  emptySquad: ['Your squad is empty', 'Ikipe yawe nta bakinnyi ifite'],
  emptySquadHint: ['Add your players first. Then you can submit them to a district camp.', "Banza wongeremo abakinnyi bawe. Nyuma ushobora kubohereza mu ikambi y'akarere."],
  inSquad: ['In squad', 'Mu ikipe'],
  outsideAge: ['Outside the age groups', "Hanze y'ibyiciro by'imyaka"],
  journey: ['Pathway', 'Urugendo'],
  noJourney: ['Not submitted to a camp yet.', 'Ntaroherezwa mu ikambi.'],
  waitingResult: ['Result not published yet', 'Ibisubizo ntibiratangazwa'],
  messageFromStaff: ['Message from TFEP staff', "Ubutumwa bw'abakozi ba TFEP"],
  certificate: ['Selection certificate', "Icyemezo cyo gutoranywa"],
  print: ['Print or save as PDF', 'Capa cyangwa ubike nka PDF'],
  share: ['Share', 'Sangiza'],
  details: ['Details', 'Ibisobanuro'],
  openCamps: ['Open district camps', "Amakambi y'akarere afunguye"],
  openCampsHint: ['Submit the players you want TFEP scouts to see. There is no limit.', "Ohereza abakinnyi ushaka ko abashakashatsi ba TFEP babona. Nta mubare ntarengwa."],
  yourDistrict: ['Your district', 'Akarere kawe'],
  noOpenCamps: ['No camp is open for submissions right now', "Nta kambi ifunguye ubu"],
  noOpenCampsHint: ['TFEP opens district camps during the season. You will see them here.', "TFEP ifungura amakambi y'uturere mu gihembwe. Uzayabona hano."],
  submitPlayers: ['Submit players', 'Ohereza abakinnyi'],
  submitTo: ['Submit to', 'Ohereza kuri'],
  noteForScouts: ['Note for the scouts', "Ubutumwa ku bashakashatsi"],
  chooseEligible: ['Players born in the camp age groups', "Abakinnyi bavutse mu byiciro by'imyaka by'ikambi"],
  noneEligible: ['No player in your squad can be submitted to this camp.', "Nta mukinnyi wo mu ikipe yawe ushobora koherezwa muri iyi kambi."],
  alreadyIn: ['Already submitted', 'Yamaze koherezwa'],
  yourSubmissions: ['Your players in this camp', 'Abakinnyi bawe muri iyi kambi'],
  withdraw: ['Withdraw', 'Kuramo'],
  invitations: ['Invitations to finals', "Ubutumire ku marushanwa ya nyuma"],
  replyBy: ['Reply by', 'Subiza mbere ya'],
  willAttend: ['Will attend', 'Azaza'],
  cannotAttend: ['Cannot attend', 'Ntazashobora kuza'],
  reason: ['Reason', 'Impamvu'],
  reasonNeeded: ['Please say why the player cannot come.', 'Nyamuneka vuga impamvu umukinnyi atazaza.'],
  change: ['Change answer', 'Hindura igisubizo'],
  noUpdates: ['No updates yet', 'Nta makuru arahari'],
  noUpdatesHint: ['Invitations and results from TFEP staff appear here.', "Ubutumire n'ibisubizo bya TFEP bigaragara hano."],
  submittedN: ['players submitted', 'abakinnyi boherejwe'],
  done: ['Done', 'Byarangiye'],
  language: ['Language', 'Ururimi'],
  selectAll: ['Select all', 'Hitamo bose'],
  clear: ['Clear', 'Siba'],
  tour: ['Tour of this screen', "Uko iyi paji ikoreshwa"],
  dateTbc: ['Date to be set', 'Itariki izatangazwa'],
} as const

export type Key = keyof typeof S
export type Lang = 'en' | 'rw'

export const STATUS_T: Record<string, [string, string]> = {
  submitted: ['Submitted', 'Yoherejwe'], invited: ['Invited', 'Yatumiwe'], confirmed: ['Coming', 'Azaza'],
  declined: ['Not coming', 'Ntazaza'], attended: ['Attended', 'Yitabiriye'], absent: ['Absent', 'Ntiyaje'], removed: ['Removed', 'Yavanywemo'],
}
export const DECISION_T: Record<string, [string, string]> = {
  selected: ['Selected', 'Yatoranyijwe'], see_again: ['To be seen again', 'Azongera kurebwa'], not_selected: ['Not selected this time', 'Ntiyatoranyijwe ubu'],
}
export const STAGE_T: Record<string, [string, string]> = {
  district: ['District camp', "Ikambi y'akarere"], province_final: ['Province final', "Irushanwa rya nyuma ry'intara"], national_final: ['National final', "Irushanwa rya nyuma ry'igihugu"],
}

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; pick: (pair: readonly [string, string] | undefined) => string }
const Ctx = createContext<LangCtx | null>(null)

function readLang(): Lang {
  try { return localStorage.getItem('pluribus.lang') === 'rw' ? 'rw' : 'en' } catch { return 'en' }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(readLang)
  const setLang = (l: Lang) => { set(l); try { localStorage.setItem('pluribus.lang', l) } catch { /* private mode */ } }
  const i = lang === 'rw' ? 1 : 0
  const value: LangCtx = { lang, setLang, t: k => S[k][i], pick: p => (p ? p[i] : '') }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useT() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useT outside LangProvider')
  return c
}
