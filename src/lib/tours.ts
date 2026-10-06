import type { TourMap } from './tour'

/** Which tour belongs to the screen at this address. */
export function staffTourKey(path: string): string | null {
  if (path === '/') return 'overview'
  if (/^\/scouting\/camps\/[^/]+$/.test(path)) return 'camp-sheet'
  const map: Record<string, string> = {
    '/scouting': 'scouting-home', '/scouting/plan': 'plan', '/scouting/academies': 'academies', '/scouting/camps': 'camps',
    '/scouting/finals': 'finals', '/scouting/players': 'players', '/scouting/pool': 'pool',
    '/dashboards': 'dashboards', '/reports': 'reports', '/files': 'files', '/users': 'users', '/settings': 'settings',
  }
  return map[path] ?? null
}

export const STAFF_TOURS: TourMap = {
  overview: [
    { title: 'Welcome to Pluribus', body: 'This is the home of the TFEP programme with SL Benfica. Every screen has a short tour like this one the first time you open it. You can skip it at any step.' },
    { target: 'nav', title: 'The menu', body: 'Everything lives here, grouped by area. Items marked "Soon" are already planned and open in a later stage of the build.' },
    { target: 'project-box', title: 'Project and season', body: 'The project you work in and the scouting season the screens show. Click it to switch to an earlier season and see its camps, finals and pool.' },
    { target: 'overview-stats', title: 'At a glance', body: 'The season, the academy register, players and camps planned. The numbers update as the staff work.' },
    { target: 'help', title: 'Need the tour again?', body: 'Press the "?" button on any screen to replay the tour of that screen.' },
  ],
  'scouting-home': [
    { target: 'funnel', title: 'Season funnel', body: 'How many players were submitted, seen at district camps, invited to the province finals and selected at the national final.' },
    { target: 'attention', title: 'Needs attention', body: 'Open items that block the season: camps without results, coaches waiting for approval, doubtful ages and districts with no camp yet. Click a line to go there.' },
    { target: 'next-camps', title: 'Next camps', body: 'The coming camps. Click one to open its sheet.' },
  ],
  plan: [
    { target: 'page-actions', title: 'Plan a camp', body: 'Create a district camp, a province final or the national final.' },
    { target: 'coverage', title: 'District coverage', body: 'Each district turns dark once it has a camp. Aim to cover all 30.' },
    { target: 'weeks', title: 'Weekend by weekend', body: 'The whole season laid out by weekend. Use "Add" on a weekend to plan a camp on that date, or click a camp to open it.' },
  ],
  academies: [
    { target: 'academy-stats', title: 'The register', body: 'Active academies, how many the scouts visited this season, players seen and selected, as recorded in the Talent folder.' },
    { target: 'filters', title: 'Find academies', body: 'Search by name, contact or district, and filter by province, district or visit status.' },
    { target: 'season', title: 'Season', body: 'Switch the season to see the visits and results of earlier years.' },
    { target: 'main table', title: 'Open an academy', body: 'Click a row to edit its details, see its scouting history and open the portal its coach sees.' },
    { target: 'page-actions', title: 'New academy', body: 'Add an academy that is not in the register yet.' },
  ],
  camps: [
    { target: 'tabs', title: 'All camps of the season', body: 'Filter by stage: district camps, province finals or the national final.' },
    { target: 'search', title: 'Search', body: 'Find a camp by name, district or staff.' },
    { target: 'main table', title: 'Open a camp', body: 'Each row shows players, attendance and selections. Click it to open the camp sheet.' },
    { target: 'page-actions', title: 'New camp', body: 'Plan a new camp here or on the Plan board.' },
  ],
  'camp-sheet': [
    { target: 'camp-stats', title: 'Camp numbers', body: 'Players, attendance, graded players and decisions update as you type.' },
    { target: 'add-player', title: 'Add players', body: 'Players submitted by coaches appear by themselves. Add walk-ins here: find an existing player or create a new one.' },
    { target: 'main table', title: 'The sheet', body: 'Enter attendance, sprint and jump results, the OBS grade, the decision and comments. Everything saves as you go. "Message to coach" is what the academy coach reads.' },
    { target: 'promote', title: 'Next stage', body: 'Invite the selected players to the next stage. Their coaches get the invitation in the portal.' },
    { target: 'publish', title: 'Publish results', body: 'Decisions stay inside the staff until you publish. Publishing sends each coach the result and your message.' },
  ],
  finals: [
    { target: 'final-cards', title: 'The finals', body: 'One card per province final and the national final. Click a card to open its sheet, or plan it if it is missing.' },
    { target: 'national', title: 'National result', body: 'The final lists by age group: selected, see again and absences, the same as the sheets in the Talent folder.' },
  ],
  players: [
    { target: 'filters', title: 'Find a player', body: 'Search by name and filter by pathway status, age group or province.' },
    { target: 'main table', title: 'One card per child', body: 'Click a player to see the full pathway, edit details, add staff notes or merge a duplicate.' },
    { target: 'page-actions', title: 'New player', body: 'Add a player directly, for example a talent found outside an academy.' },
  ],
  pool: [
    { target: 'filters', title: 'Filters', body: 'Narrow the pool by age group, province or name.' },
    { target: 'columns', title: 'The potential pool', body: 'Each column is a step of the pathway. Players move by themselves as camps record their results.' },
  ],
  dashboards: [
    { target: 'season', title: 'Season', body: 'Choose the scouting season to analyse.' },
    { target: 'kpis', title: 'Key numbers', body: 'Coverage of academies and districts, and how many players reached each stage.' },
    { target: 'regions', title: 'By province', body: 'Compare the five provinces from submissions to selections.' },
    { target: 'history', title: 'Season against season', body: 'Visits, players seen and selected in every season the system knows, including the history from the Talent folder.' },
    { target: 'print', title: 'Print', body: 'Print the dashboard or save it as a PDF for a meeting.' },
  ],
  reports: [
    { target: 'report-list', title: 'Ready reports', body: 'Choose a report. Each one is built from live data.' },
    { target: 'report-filters', title: 'Filters', body: 'Set the season, camp, province or academy the report should cover.' },
    { target: 'report-export', title: 'Excel or PDF', body: 'Download an Excel file formatted for printing, or open the print version and save it as PDF.' },
    { target: 'report-preview', title: 'Preview', body: 'Check the report here before you download it.' },
  ],
  files: [
    { target: 'file-stats', title: 'The Talent folder', body: 'Every folder and file of the shared folder that SL Benfica and TFEP use, with the date of the last change.' },
    { target: 'crumbs', title: 'Where you are', body: 'The path of the folder you are in. Click a part of it to go back up.' },
    { target: 'search', title: 'Search', body: 'Find any file in the whole folder by part of its name.' },
    { target: 'file-list', title: 'Open a file', body: 'Click a folder to open it, or a file to open it in SharePoint. Finance, contracts and personal documents are shown to admins only.' },
  ],
  users: [
    { target: 'tabs', title: 'Accounts', body: 'Coaches who sign up through the link wait under "pending" until you approve them.' },
    { target: 'main table', title: 'Manage a user', body: 'Edit the role and academy, lock an account, set a new password, open "Access" to choose what the user sees and can change, or use "View as" to see the system exactly as that user does.' },
    { target: 'page-actions', title: 'New user', body: 'Create staff accounts with a username and password.' },
  ],
  settings: [
    { target: 'project', title: 'Project', body: 'The project details and the link to the shared Talent folder.' },
    { target: 'seasons', title: 'Seasons', body: 'Which season is being scouted and which one is running.' },
    { target: 'age-groups', title: 'Age groups', body: 'The birth years of each age group for the scouting season. Camps and pools use them everywhere.' },
  ],
}
