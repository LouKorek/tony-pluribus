import type { TourMap } from '../../lib/tour'

// Each text is [English, Kinyarwanda]. The Kinyarwanda is a first draft for review by a native speaker.
export const COACH_TOURS: TourMap = {
  'coach-home': [
    {
      title: ['Welcome to the coach portal', "Murakaza neza ku rubuga rw'umutoza"],
      body: ['This is where your academy works with Tony. Every screen has a short tour. You can skip it at any time.',
             "Aha ni ho ishuri ryawe rikorana na Tony. Buri paji ifite ubusobanuro bugufi. Ushobora kubusimbuka igihe cyose."],
    },
    {
      target: 'lang', title: ['Language', 'Ururimi'],
      body: ['Switch between English and Kinyarwanda here.', "Hindura hagati y'Icyongereza n'Ikinyarwanda hano."],
    },
    {
      target: 'coach-stats', title: ['Your season', 'Igihembwe cyawe'],
      body: ['Active players, training sessions this month, players selected, and your next camp. Tap a card to open it.',
             "Abakinnyi bakina, imyitozo y'uku kwezi, abatoranyijwe, n'ikambi itaha. Kanda ku ikarita kugira ngo uyifungure."],
    },
    {
      target: 'coach-actions', title: ['Action needed', 'Ibikenewe gukorwa'],
      body: ['Invitations to answer and camps that are open for your players. Tap a line to deal with it.',
             'Ubutumire bugomba gusubizwa n’amakambi afunguye ku bakinnyi bawe. Kanda ku murongo kugira ngo ubikore.'],
    },
    {
      target: 'coach-tabs', title: ['Menu', 'Ibikubiyemo'],
      body: ['Move between Home, your team, the schedule and updates.', "Jya ahabanza, ku ikipe yawe, kuri gahunda no ku makuru."],
    },
    {
      target: 'help', title: ['Tour again', 'Ongera urebe ubusobanuro'],
      body: ['Tap "?" on any screen to see its tour again.', 'Kanda "?" kuri paji iyo ari yo yose kugira ngo wongere urebe ubusobanuro bwayo.'],
    },
  ],
  'coach-team': [
    {
      target: 'team-tabs', title: ['Your team', 'Ikipe yawe'],
      body: ['Players, your training sessions and your academy profile. This is your tool to manage the team; Tony sees it too.',
             "Abakinnyi, imyitozo yawe n'umwirondoro w'ishuri ryawe. Iki ni igikoresho cyawe cyo kuyobora ikipe; na Tony abibona."],
    },
    {
      target: 'add-player', title: ['Add your players', 'Ongeramo abakinnyi bawe'],
      body: ['Add each player once with name and birth year. A photo, height and weight complete the profile.',
             "Ongeramo buri mukinnyi rimwe, ufite izina n'umwaka w'amavuko. Ifoto, uburebure n'ibiro byuzuza umwirondoro."],
    },
    {
      target: 'squad-list', title: ['Your squad', 'Ikipe yawe'],
      body: ['Every player shows his age group and where he stands. Tap a player to see his pathway, write notes in his log, and find certificates.',
             "Buri mukinnyi agaragaza icyiciro cy'imyaka n'aho ageze. Kanda ku mukinnyi urebe urugendo rwe, wandike inyandiko, ubone ibyemezo."],
    },
  ],
  'coach-training': [
    {
      target: 'log-session', title: ['Log a session', 'Andika umwitozo'],
      body: ['After each training, log it in 20 seconds: day, focus and who was there. Tony sees that your academy is active.',
             "Nyuma ya buri mwitozo, wandike mu masegonda 20: umunsi, icyo mwitojeho n'abahari. Tony abona ko ishuri ryawe rikora."],
    },
    {
      target: 'sessions', title: ['Your sessions', 'Imyitozo yawe'],
      body: ['The bar shows attendance. Tap a session to edit it.', 'Umurongo werekana abitabiriye. Kanda ku mwitozo kugira ngo uwuhindure.'],
    },
  ],
  'coach-academy': [
    {
      target: 'programme-status', title: ['Your status with Tony', 'Imimerere yawe kuri Tony'],
      body: ['Tony follows every academy that is registered here. Keeping your squad and training up to date is what counts.',
             "Tony akurikirana buri shuri ryanditswe hano. Gushyira ikipe n'imyitozo ku gihe ni byo bifite agaciro."],
    },
    {
      target: 'academy-profile', title: ['Academy profile', "Umwirondoro w'ishuri"],
      body: ['Where and when you train, how many players, which age groups. This is what the staff sees about your academy.',
             "Aho mwitorera n'igihe, umubare w'abakinnyi, ibyiciro by'imyaka. Ibi ni byo abakozi babona ku ishuri ryawe."],
    },
  ],
  'coach-schedule': [
    {
      target: 'your-day', title: ['Your day at the camp', 'Umunsi wawe mu ikambi'],
      body: ['When Tony sets the day and time your academy comes, it appears here. Confirm it, ask for a change, or say you cannot come.',
             "Iyo Tony ashyizeho umunsi n'isaha ishuri ryawe rizaza, bigaragara hano. Emeza, saba guhindura, cyangwa uvuge ko mutazaza."],
    },
    {
      target: 'invites', title: ['Invitations', 'Ubutumire'],
      body: ['When a player is invited to a final, say here if he will come. If he cannot, give the reason.',
             'Iyo umukinnyi atumiwe ku irushanwa rya nyuma, vuga hano niba azaza. Niba atazaza, tanga impamvu.'],
    },
    {
      target: 'open-camps', title: ['Submit to district camps', "Ohereza mu makambi y'akarere"],
      body: ['These camps are open for your players. Tap "Submit players", choose the players and add a note for the scouts. You can withdraw a player until the camp starts.',
             'Aya makambi arafunguye ku bakinnyi bawe. Kanda "Ohereza abakinnyi", hitamo abakinnyi kandi wandike ubutumwa ku bashakashatsi. Ushobora gukuramo umukinnyi mbere y’uko ikambi itangira.'],
    },
  ],
  'coach-updates': [
    {
      target: 'updates', title: ['Updates', 'Amakuru'],
      body: ['Invitations and results from Tony staff arrive here. Tap one to open it.',
             "Ubutumire n'ibisubizo bivuye ku bakozi ba Tony biza hano. Kanda kuri kimwe ukifungure."],
    },
    {
      target: 'notif-settings', title: ['Notification settings', "Igenamiterere ry'amakuru"],
      body: ['Turn on notifications on this phone to hear about camps, invitations and decisions even when the app is closed, and choose what you want to receive.',
             "Fungura amakuru kuri iyi telefoni kugira ngo umenye amakambi, ubutumire n'ibyemezo n'iyo porogaramu ifunze, kandi uhitemo ibyo ushaka kubona."],
    },
  ],
}
