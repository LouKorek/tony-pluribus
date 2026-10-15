import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { LANGUAGE_NAMES, useGeo, usePointsName, type ProjectSettings } from '../../lib/brand'
import { readLang, useDeviceLang, writeLang } from '../../lib/lang'
import { fmtDate, fmtRange } from '../../lib/scouting'

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
  guardianConsent: ['The guardian agrees to the player taking part in Tony camps', "Umubyeyi yemeye ko umukinnyi yitabira amakambi ya Tony"],
  guardianHint: ['Needed later if the player joins the Tony squad.', 'Bizakenerwa nyuma niba umukinnyi yinjiye mu ikipe ya Tony.'],
  notes: ['Notes for Tony', 'Ibisobanuro kuri Tony'],
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
  messageFromStaff: ['Message from Tony staff', "Ubutumwa bw'abakozi ba Tony"],
  certificate: ['Selection certificate', "Icyemezo cyo gutoranywa"],
  print: ['Print or save as PDF', 'Capa cyangwa ubike nka PDF'],
  share: ['Share', 'Sangiza'],
  details: ['Details', 'Ibisobanuro'],
  openCamps: ['Open district camps', "Amakambi y'akarere afunguye"],
  openCampsHint: ['Submit the players you want Tony scouts to see. There is no limit.', "Ohereza abakinnyi ushaka ko abashakashatsi ba Tony babona. Nta mubare ntarengwa."],
  yourDistrict: ['Your district', 'Akarere kawe'],
  noOpenCamps: ['No camp is open for submissions right now', "Nta kambi ifunguye ubu"],
  noOpenCampsHint: ['Tony opens district camps during the season. You will see them here.', "Tony ifungura amakambi y'uturere mu gihembwe. Uzayabona hano."],
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
  noUpdatesHint: ['Invitations and results from Tony staff appear here.', "Ubutumire n'ibisubizo bya Tony bigaragara hano."],
  notifSettings: ['Notification settings', "Igenamiterere ry'amakuru"],
  pushTitle: ['Notifications on this phone', 'Amakuru kuri iyi telefoni'],
  pushOn: ['This phone gets a notification even when the app is closed.', "Iyi telefoni ibona amakuru n'iyo porogaramu ifunze."],
  pushOff: ['Turn on to get camp dates, invitations and decisions on this phone, even when the app is closed.', "Fungura kugira ngo ubone amatariki y'amakambi, ubutumire n'ibyemezo kuri iyi telefoni, n'iyo porogaramu ifunze."],
  pushEnable: ['Turn on', 'Fungura'],
  pushDisable: ['Turn off', 'Funga'],
  pushUnsupported: ['This browser cannot show notifications. On iPhone, add the app to the home screen first.', 'Iyi mushakisha ntishobora kwerekana amakuru. Kuri iPhone, banza ushyire porogaramu kuri ecran.'],
  pushBlocked: ['Notifications are blocked for this site in the phone settings.', "Amakuru yafunzwe kuri uru rubuga mu igenamiterere rya telefoni."],
  inApp: ['In app', 'Muri porogaramu'],
  pushCol: ['Push', 'Push'],
  resetPrefs: ['Reset to defaults', 'Garura ibisanzwe'],
  prefsHint: ['Choose what you get and where.', 'Hitamo ibyo ubona n\'aho ubibona.'],
  markAllRead: ['Mark all read', 'Byose byasomwe'],
  team: ['My team', 'Ikipe yanjye'],
  schedule: ['Schedule', 'Gahunda'],
  players: ['Players', 'Abakinnyi'],
  training: ['Training', 'Imyitozo'],
  academy: ['Academy', 'Ishuri'],
  photo: ['Photo', 'Ifoto'],
  addPhoto: ['Add photo', 'Shyiraho ifoto'],
  changePhoto: ['Change photo', 'Hindura ifoto'],
  removePhoto: ['Remove photo', 'Kura ifoto'],
  shirtNo: ['Shirt number', "Nimero y'umupira"],
  height: ['Height (cm)', 'Uburebure (cm)'],
  weight: ['Weight (kg)', 'Ibiro (kg)'],
  school: ['School', 'Ishuri yigaho'],
  sector: ['Sector / village', 'Umurenge / umudugudu'],
  joinedYear: ['In the academy since', "Yinjiye mu ishuri muri"],
  squadStatus: ['Status', 'Imimerere'],
  statusActive: ['Active', 'Arakina'],
  statusUnavailable: ['Not available', 'Ntaboneka'],
  statusLeft: ['Left the academy', 'Yavuye mu ishuri'],
  measured: ['Measured', 'Byapimwe'],
  playerLog: ['Coach log', "Inyandiko z'umutoza"],
  addNote: ['Add a note', 'Ongeraho inyandiko'],
  noteKindNote: ['Note', 'Inyandiko'],
  noteKindMatch: ['Match', 'Umukino'],
  noteKindAbsent: ['Absent', 'Yabuze'],
  noteKindInjury: ['Not available', 'Ntaboneka'],
  noLog: ['No notes yet. Write how the player is doing: matches, progress, absences.', "Nta nyandiko. Andika uko umukinnyi ahagaze: imikino, iterambere, kubura."],
  sessionsLast90: ['sessions in 90 days', 'imyitozo mu minsi 90'],
  profileComplete: ['Profile complete', 'Umwirondoro wuzuye'],
  profileIncomplete: ['Add a photo, height and weight to complete the profile.', 'Ongeraho ifoto, uburebure n\'ibiro kugira ngo wuzuze umwirondoro.'],
  logSession: ['Log a session', 'Andika umwitozo'],
  editSession: ['Edit session', 'Hindura umwitozo'],
  sessionDay: ['Day', 'Umunsi'],
  topic: ['Focus of the session', "Icyo mwitojeho"],
  topicTechnique: ['Technique', 'Ubuhanga'],
  topicTactics: ['Tactics', 'Amayeri'],
  topicFitness: ['Fitness', 'Imbaraga'],
  topicMatch: ['Match', 'Umukino'],
  topicOther: ['Other', 'Ibindi'],
  duration: ['Minutes', 'Iminota'],
  attendance: ['Who was there', 'Abahari'],
  selectAll: ['Select all', 'Hitamo bose'],
  clear: ['Clear', 'Siba'],
  noSessions: ['No training logged yet', 'Nta mwitozo wanditswe'],
  noSessionsHint: ['Log each training session in 20 seconds. Tony sees that your academy is active.', 'Andika buri mwitozo mu masegonda 20. Tony abona ko ishuri ryawe rikora.'],
  present: ['present', 'bahari'],
  deleteSession: ['Delete session', 'Siba umwitozo'],
  academyProfile: ['Academy profile', "Umwirondoro w'ishuri"],
  academyProfileHint: ['Tell Tony where and when you train. This is what the staff sees about your academy.', "Bwira Tony aho mwitorera n'igihe. Ibi ni byo abakozi babona ku ishuri ryawe."],
  venue: ['Training ground', 'Ikibuga mwitorera'],
  trainingDays: ['Training days', "Iminsi y'imyitozo"],
  trainingTime: ['Usual time', 'Isaha isanzwe'],
  playersCount: ['Players in the academy', "Abakinnyi bo mu ishuri"],
  ageGroupsLabel: ['Age groups you train', "Ibyiciro by'imyaka utoza"],
  contactPhone: ['Your phone', 'Telefoni yawe'],
  teamPhoto: ['Team photo', "Ifoto y'ikipe"],
  programmeStatus: ['Status in the Tony programme', 'Imimerere muri gahunda ya Tony'],
  st_registered: ['Registered', 'Yanditswe'],
  st_observed: ['Observed by Tony', 'Ikurikiranwa na Tony'],
  st_partner: ['Partner academy', 'Ishuri ryifatanya na Tony'],
  st_official: ['Official academy', 'Ishuri ryemewe'],
  st_registered_hint: ['Your academy is registered. Everything you do here counts for Tony.', 'Ishuri ryawe ryanditswe. Ibyo ukora hano byose bifite agaciro kuri Tony.'],
  st_observed_hint: ['Tony follows your academy. Keep your squad and training up to date.', 'Tony akurikirana ishuri ryawe. Komeza ushyire ikipe n\'imyitozo ku gihe.'],
  st_partner_hint: ['Your academy is a Tony partner academy.', 'Ishuri ryawe ni ishuri ryifatanya na Tony.'],
  st_official_hint: ['Your academy is an official academy of the programme.', 'Ishuri ryawe ni ishuri ryemewe rya gahunda.'],
  mon: ['Mon', 'Mbe'], tue: ['Tue', 'Kab'], wed: ['Wed', 'Gat'], thu: ['Thu', 'Kan'], fri: ['Fri', 'Gat5'], sat: ['Sat', 'Gat6'], sun: ['Sun', 'Cyu'],
  yourDay: ['Your day at the camp', 'Umunsi wawe mu ikambi'],
  reportAt: ['Report at', 'Hagera saa'],
  playersExpected: ['Players you will bring', 'Abakinnyi uzazana'],
  confirmDay: ['Confirm', 'Emeza'],
  requestChange: ['Ask to change', 'Saba guhindura'],
  cannotCome: ['We cannot come', 'Ntituzashobora kuza'],
  changeNote: ['What should change?', 'Ni iki cyahinduka?'],
  dayConfirmed: ['Confirmed', 'Byemejwe'],
  dayProposed: ['Please confirm', 'Nyamuneka emeza'],
  dayChangeRequested: ['Change requested', 'Impinduka yasabwe'],
  dayDeclined: ['Not coming', 'Ntibazaza'],
  dayArrived: ['Arrived', 'Bageze'],
  noDayYet: ['Tony staff will set your day and time. You will get a notification.', "Abakozi ba Tony bazashyiraho umunsi n'isaha. Uzabona ubutumwa."],
  upcoming: ['Upcoming', 'Ibizaza'],
  past: ['Past camps', 'Amakambi yashize'],
  yourPlayersInCamp: ['of your players in this camp', "by'abakinnyi bawe muri iyi kambi"],
  staffNote: ['Note from Tony staff', "Ubutumwa bw'abakozi ba Tony"],
  seeSchedule: ['See the schedule', 'Reba gahunda'],
  confirmYourDay: ['Confirm your camp day', 'Emeza umunsi wawe mu ikambi'],
  logThisWeek: ['Log this week\'s training', "Andika imyitozo y'iki cyumweru"],
  completeAcademy: ['Complete your academy profile', "Uzuza umwirondoro w'ishuri ryawe"],
  completeProfiles: ['Players without a photo', 'Abakinnyi badafite ifoto'],
  activeTeam: ['Active players', 'Abakinnyi bakina'],
  sessions30: ['Sessions · 30 days', 'Imyitozo · iminsi 30'],
  nextCamp: ['Next camp', 'Ikambi itaha'],
  tapToAdd: ['Tap to add', 'Kanda wongereho'],
  uploadFailed: ['The photo could not be uploaded. Try a smaller picture.', 'Ifoto ntiyashoboye koherezwa. Gerageza ifoto ntoya.'],
  submittedN: ['players submitted', 'abakinnyi boherejwe'],
  done: ['Done', 'Byarangiye'],
  language: ['Language', 'Ururimi'],
  tour: ['Tour of this screen', "Uko iyi paji ikoreshwa"],
  dateTbc: ['Date to be set', 'Itariki izatangazwa'],
  progress: ['Progress', 'Iterambere'],
  level: ['Level', 'Urwego'],
  points: ['points', 'amanota'],
  thisSeason: ['this season', 'iki gihembwe'],
  toNext: ['to', 'kugera kuri'],
  topLevel: ['Top level reached', "Urwego rwo hejuru rwagezweho"],
  rankDistrict: ['District', 'Akarere'],
  rankProvince: ['Province', 'Intara'],
  rankNational: ['National', 'Igihugu'],
  badges: ['Badges', 'Ibirango'],
  howToEarn: ['How to earn', "Uko wabona"],
  showLess: ['Show less', 'Erekana bike'],
  showAll: ['Show all', 'Erekana byose'],
  showAllRules: ['All the ways to earn', "Inzira zose zo kubona amanota"],
  history: ['Your points', 'Amanota yawe'],
  yourPts: ['Your', 'Amanota yawe:'],
  noPointsYet: ['No points yet', 'Nta manota uragira'],
  noPointsHint: ['Add your players, log your training and come to the camps. Every step counts.', "Ongeramo abakinnyi bawe, andika imyitozo yawe, uze mu makambi. Buri ntambwe ibarwa."],
  provinceBoard: ['Academies in your province', "Amashuri yo mu ntara yawe"],
  academiesIn: ['Academies in your', 'Amashuri yo mu'],
  boardEmpty: ['No academy in your province has points yet. Be the first.', "Nta shuri ryo mu ntara yawe rirabona amanota. Ba uwa mbere."],
  you: ['you', 'wowe'],
  staffFeedback: ['Feedback from Tony staff', "Ibitekerezo by'abakozi ba Tony"],
  reliability: ['Reliability', 'Kwizerwa'],
  playerQuality: ['Player quality', "Ubuhanga bw'abakinnyi"],
  engagement: ['Engagement', 'Ubwitange'],
  cooperation: ['Cooperation', 'Ubufatanye'],
  upTo: ['up to', 'kugeza kuri'],
  perDay: ['a day', "ku munsi"],
  perWeek: ['a week', "mu cyumweru"],
  perSeason: ['a season', "mu gihembwe"],
  onceOnly: ['once', 'rimwe gusa'],
  noProgressYet: ['Your points and badges appear here once your academy is linked to your account.', "Amanota n'ibirango byawe bizagaragara hano iyo ishuri ryawe rihujwe na konti yawe."],
  yourLevel: ['Your level', 'Urwego rwawe'],
  waitingToSend: ['Waiting to send', 'Bitegereje koherezwa'],
  focus: ['Focus of the session', "Icyo imyitozo yibanzeho"],
  focusHint: ['Pick one or more', 'Hitamo kimwe cyangwa byinshi'],
  intensity: ['Intensity', 'Ubukana'],
  intLight: ['Light', 'Byoroheje'],
  intNormal: ['Normal', 'Bisanzwe'],
  intHard: ['Hard', 'Bikomeye'],
  fTechnical: ['Technical', 'Tekiniki'],
  fTactical: ['Tactical', 'Amayeri'],
  fPhysical: ['Physical', "Umubiri"],
  fGoalkeeping: ['Goalkeeping', "Abanyezamu"],
  fGames: ['Small-sided games', 'Imikino mito'],
  fSetPieces: ['Set pieces', "Imipira ihagaze"],
  fMental: ['Mental / team talk', "Ubwenge / ikiganiro"],
  fRecovery: ['Recovery', 'Kuruhuka'],
  matches: ['Matches', 'Imikino'],
  logMatch: ['Log a match', 'Andika umukino'],
  editMatch: ['Edit match', 'Hindura umukino'],
  deleteMatch: ['Delete', 'Siba'],
  noMatches: ['No matches logged yet', 'Nta mukino urandikwa'],
  noMatchesHint: ['Every match counts: internal games, friendlies, league, cups and tournaments. Log the squad that played and the score.', "Buri mukino ubarwa: imikino y'imbere, iyo gukina gusa, shampiyona, ibikombe n'amarushanwa. Andika abakinnye n'ibitego."],
  matchDay: ['Day of the match', "Umunsi w'umukino"],
  matchKind: ['Kind of match', "Ubwoko bw'umukino"],
  kInternal: ['Internal', "Imbere mu ishuri"],
  kFriendly: ['Friendly', 'Gukina gusa'],
  kLeague: ['League', 'Shampiyona'],
  kCup: ['Cup', 'Igikombe'],
  kTournament: ['Tournament', 'Irushanwa'],
  kTony: ['Tony event', "Igikorwa cya Tony"],
  opponent: ['Opponent', 'Abo mwakinnye'],
  matchVenue: ['Venue', 'Aho byabereye'],
  vHome: ['Home', 'Iwacu'],
  vAway: ['Away', 'Iwabo'],
  vNeutral: ['Neutral', 'Ahandi'],
  score: ['Score', 'Ibitego'],
  scoreUs: ['Us', 'Twe'],
  scoreThem: ['Them', 'Bo'],
  whoPlayed: ['Who played', 'Abakinnye'],
  goalsBy: ['goals', 'ibitego'],
  ageGroupPlayed: ['Age group', "Icyiciro cy'imyaka"],
  staffTitle: ['Academy staff', "Abakozi b'ishuri"],
  staffHint: ['The people who run the academy with you: assistants, goalkeeper coach, physio, volunteers.', "Abakorana nawe mu ishuri: abafasha, umutoza w'abanyezamu, umuvuzi, abakorerabushake."],
  addStaff: ['Add a person', 'Ongeraho umuntu'],
  editStaff: ['Edit person', 'Hindura umuntu'],
  noStaff: ['Only you so far. Add the people who help.', "Wowe gusa kugeza ubu. Ongeraho abagufasha."],
  role: ['Role', 'Inshingano'],
  rHeadCoach: ['Head coach', 'Umutoza mukuru'],
  rAssistant: ['Assistant coach', 'Umutoza wungirije'],
  rGkCoach: ['Goalkeeper coach', "Umutoza w'abanyezamu"],
  rFitness: ['Fitness coach', "Umutoza w'imyitozo ngororamubiri"],
  rPhysio: ['Physio / first aid', "Umuvuzi / ubutabazi bw'ibanze"],
  rManager: ['Team manager', "Umuyobozi w'ikipe"],
  rVolunteer: ['Volunteer', 'Umukorerabushake'],
  rOther: ['Other', 'Ibindi'],
  phone: ['Phone', 'Telefone'],
  sinceYear: ['With the academy since', "Ari mu ishuri kuva"],
  stillActive: ['Active', 'Aracyakora'],
  equipmentTitle: ['Equipment on the ground', 'Ibikoresho ku kibuga'],
  equipmentHint: ['For each item: how many are good, how many are worn, and how many more you need. Tony sees what is needed; it guides the rewards.', "Kuri buri kintu: bingahe bimeze neza, bingahe byashaje, n'ibindi bingahe ukeneye. Tony abona ibikenewe; bifasha mu bihembo."],
  quantity: ['How many', 'Bingahe'],
  condition: ['Condition', 'Uko bimeze'],
  cGood: ['Good', 'Byiza'],
  cWorn: ['Worn', 'Byashaje'],
  cMissing: ['Missing', 'Birabura'],
  cNeeded: ['Needed', 'Bikenewe'],
  addEquipment: ['Add equipment', 'Ongeraho ibikoresho'],
  nightMode: ['Night mode', 'Uburyo bwa nijoro'],
  dayMode: ['Day mode', 'Uburyo bwa ku manywa'],
  addSelected: ['Add', 'Ongeraho'],
  searchEquipment: ['Search the list', 'Shakisha mu rutonde'],
  noEquipment: ['Nothing counted yet. Add the equipment you have on the ground.', "Nta kintu kirabarwa. Ongeraho ibikoresho ufite ku kibuga."],
  noEquipmentMatch: ['Nothing in the list matches. Add it below as something else.', "Nta kintu gihuye. Cyongereho hepfo nk'ikindi."],
  somethingElse: ['Something not in the list', 'Ikintu kitari ku rutonde'],
  somethingElseHint: ['Only if it is really not above: write its name.', "Gusa iyo kitari hejuru: andika izina ryacyo."],
  somethingElsePh: ['e.g. Rebound wall', 'urugero: Urukuta rwo gusubiza'],

  eqHave: ['items on the ground', 'ibikoresho ku kibuga'],
  eqNeeded: ['still needed', 'biracyakenewe'],
  lastCounted: ['Last counted', 'Byabazwe bwa nyuma'],
  saveEquipment: ['Save the count', 'Bika ibaruramari'],
  tierOf: ['tier', 'urwego'],
  nextBadge: ['Next', 'Ikurikira'],
  offline: ['Offline', 'Nta murandasi'],
  offlineHint: ['No network. You can keep working: everything you save is sent when the phone is back online.', "Nta murandasi. Ushobora gukomeza gukora: ibyo ubitse byose bizoherezwa iyo telefoni yongeye kugira murandasi."],
  savedCopy: ['Showing the last saved copy', 'Werekwa kopi ya nyuma yabitswe'],
  pendingChanges: ['changes waiting to send', 'impinduka zitegereje koherezwa'],
  failedChanges: ['could not be sent', 'ntibyashoboye koherezwa'],
  sendNow: ['Send now', 'Ohereza ubu'],
  syncing: ['Sending…', 'Birimo koherezwa…'],
  allSent: ['Everything is sent', 'Byose byoherejwe'],
  discard: ['Discard', 'Kuraho'],
  retry: ['Try again', 'Ongera ugerageze'],
  outboxTitle: ['Changes waiting', 'Impinduka zitegereje'],
  seeProgress: ['See your progress', 'Reba iterambere ryawe'],
  installApp: ['Install the app', 'Shyiramo porogaramu'],
  deleteNote: ['Delete', 'Siba'],
  certTitle: ['Certificate of selection', 'Icyemezo cyo gutoranywa'],
  certBefore: ['has been', ''],
  certSelectedWord: ['selected', 'yatoranyijwe'],
  certAfter: ['at the', 'mu'],
  certPartner: ['in partnership with', "ku bufatanye na"],
  certShareText: ['has been selected at the', 'yatoranyijwe mu'],
  prefCustom: ['custom', 'wabihinduye'],
  loading: ['Loading…', 'Birimo gutangira…'],
  pointsOne: ['point', 'inota'],
  pointsMany: ['points', 'amanota'],
} as const

export type Key = keyof typeof S

/** The outbox rows (changes waiting to be sent) in Kinyarwanda; keys as in OUTBOX_EN (src/lib/offline.ts). */
export const OUTBOX_RW: Record<string, string> = {
  player: 'Umukinnyi: {a}', session: 'Umwitozo {a}', match: 'Umukino {a}', academy: "Umwirondoro w'ishuri", staff: 'Umukozi', staffRemoved: 'Umukozi yakuwemo',
  equipment: "Ibaruramari ry'ibikoresho", note: "Inyandiko y'umukinnyi", noteRemoved: "Inyandiko y'umukinnyi yakuwemo", submit: 'Abakinnyi boherejwe mu ikambi', rsvp: "Igisubizo cy'ubutumire", booking: "Igisubizo cy'umunsi w'ikambi",
  playerRemoved: 'Umukinnyi yakuwemo', withdraw: 'Umukinnyi yakuwe mu ikambi', sessionRemoved: 'Umwitozo wakuwemo', matchRemoved: 'Umukino wakuwemo', rpc: '{a}', added: 'Byongewemo: {a}', removed: 'Byakuwemo: {a}', changed: 'Byahinduwe: {a}',
  'upload.player': "Ifoto y'umukinnyi", 'upload.academy': "Ifoto y'ishuri",
}
/** 'en', 'rw', or any code the project configures; unknown codes fall back to English plus the project's own strings. */
export type Lang = string

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

interface LangCtx { lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; pick: (pair: readonly [string, string] | undefined) => string; languages: { code: string; label: string }[] }
const Ctx = createContext<LangCtx | null>(null)


export function LangProvider({ children }: { children: ReactNode }) {
  const { project, profile } = useAuth()
  const codes = ((project?.settings as ProjectSettings | undefined)?.languages ?? ['en', 'rw']).filter(Boolean)
  const languages = (codes.length ? codes : ['en']).map(c => ({ code: c, label: LANGUAGE_NAMES[c] ?? c.toUpperCase() }))
  const [lang, set] = useState<Lang>(readLang)
  const [over, setOver] = useState<Record<string, Record<string, string>>>({})
  // the project's own wording per language (Settings › Portal languages); cached for offline like every read
  useEffect(() => { supabase.rpc('portal_strings').then(({ data }) => setOver((data as Record<string, Record<string, string>>) ?? {})) }, [project?.id])
  const active = languages.some(l => l.code === lang) ? lang : languages[0].code
  const setLang = (l: Lang) => { set(l); writeLang(l) }
  // the server keeps the coach's language so push notifications arrive in it
  useEffect(() => {
    if (!profile || profile.role !== 'coach' || profile.status !== 'active') return
    if ((profile as { lang?: string }).lang !== active) supabase.rpc('set_lang', { p_lang: active }).then(() => {})
  }, [active, profile])
  const i = active === 'rw' ? 1 : 0
  const t = (k: Key) => over[active]?.[k] ?? S[k][i]
  const value: LangCtx = { lang: active, setLang, t, pick: p => (p ? p[i] : ''), languages }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
/** A record with an English text and, maybe, a Kinyarwanda one (labels from the database): the one for the active language. */
export function useLocal() {
  const { lang } = useT()
  return <T extends { label: string; label_rw?: string | null; description?: string | null; description_rw?: string | null }>(x: T | null | undefined) => ({
    label: x ? (lang === 'rw' && x.label_rw) || x.label : '',
    description: x ? (lang === 'rw' && x.description_rw) || x.description || '' : '',
  })
}
/** What the project calls its points, in the portal's language when the project has no name of its own. */
export function useCoachPointsName() {
  const pn = usePointsName()
  const { project } = useAuth()
  const { t } = useT()
  const custom = !!(project?.settings as ProjectSettings | undefined)?.points_name?.many?.trim()
  if (custom) return pn
  const many = t('pointsMany')
  return { one: t('pointsOne'), many, short: many, Many: many.charAt(0).toUpperCase() + many.slice(1) }
}
/** The project's two geographic levels; the Rwandan defaults (Province, District) in Kinyarwanda when the portal is in it. */
export function useCoachGeo() {
  const geo = useGeo()
  const { lang } = useT()
  if (lang !== 'rw') return geo
  const region = geo.region === 'Province' ? 'Intara' : geo.region, district = geo.district === 'District' ? 'Akarere' : geo.district
  return { region, district, regions: region === 'Intara' ? 'Intara' : geo.regions, districts: district === 'Akarere' ? 'Uturere' : geo.districts }
}
const RW_MONTHS = ['Mutarama', 'Gashyantare', 'Werurwe', 'Mata', 'Gicurasi', 'Kamena', 'Nyakanga', 'Kanama', 'Nzeri', 'Ukwakira', 'Ugushyingo', 'Ukuboza']
const RW_DAYS = ['Cyumweru', 'Mbere', 'Kabiri', 'Gatatu', 'Kane', 'Gatanu', 'Gatandatu']
const toDate = (d: string) => new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
/** Dates in the portal's language: English as the staff screens, Kinyarwanda month and day names otherwise. */
export function useFmt() {
  const rw = useDeviceLang() === 'rw'
  const date = (d: string | null | undefined, withYear = true) => {
    if (!d) return '—'
    if (!rw) return fmtDate(d, withYear)
    const x = toDate(d)
    return `${x.getDate()} ${RW_MONTHS[x.getMonth()]}${withYear ? ' ' + x.getFullYear() : ''}`
  }
  const range = (a: string | null, b: string | null) => !rw ? fmtRange(a, b) : !a ? 'Itariki izashyirwaho' : !b || a === b ? date(a) : `${date(a, false)} – ${date(b)}`
  /** short month for the date tiles ("Oct" / "Ukw") */
  const month = (d: string) => rw ? RW_MONTHS[toDate(d).getMonth()].slice(0, 3) : toDate(d).toLocaleDateString('en-GB', { month: 'short' })
  /** short weekday + month for the booking tile ("Tue Oct" / "Kabiri Ukw") */
  const dayMonth = (d: string) => rw ? `${RW_DAYS[toDate(d).getDay()]} ${month(d)}` : toDate(d).toLocaleDateString('en-GB', { weekday: 'short', month: 'short' })
  return { date, range, month, dayMonth }
}
/** Every portal string with its English and Kinyarwanda base text, for the Settings editor. */
export const BASE_STRINGS = S

export function useT() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useT outside LangProvider')
  return c
}
