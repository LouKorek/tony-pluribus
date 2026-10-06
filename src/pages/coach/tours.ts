import type { TourMap } from '../../lib/tour'

// Each text is [English, Kinyarwanda]. The Kinyarwanda is a first draft for review by a native speaker.
export const COACH_TOURS: TourMap = {
  'coach-home': [
    {
      title: ['Welcome to the coach portal', "Murakaza neza ku rubuga rw'umutoza"],
      body: ['This is where your academy works with TFEP and SL Benfica. Every screen has a short tour. You can skip it at any time.',
             "Aha ni ho ishuri ryawe rikorana na TFEP na SL Benfica. Buri paji ifite ubusobanuro bugufi. Ushobora kubusimbuka igihe cyose."],
    },
    {
      target: 'lang', title: ['Language', 'Ururimi'],
      body: ['Switch between English and Kinyarwanda here.', "Hindura hagati y'Icyongereza n'Ikinyarwanda hano."],
    },
    {
      target: 'coach-stats', title: ['Your season', 'Igihembwe cyawe'],
      body: ['Players in your squad, players submitted to camps, players selected, and your rank among the academies of your province.',
             "Abakinnyi bo mu ikipe yawe, abo wohereje mu makambi, abatoranyijwe, n'umwanya wawe mu mashuri y'intara yawe."],
    },
    {
      target: 'coach-actions', title: ['Action needed', 'Ibikenewe gukorwa'],
      body: ['Invitations to answer and camps that are open for your players. Tap a line to deal with it.',
             'Ubutumire bugomba gusubizwa n’amakambi afunguye ku bakinnyi bawe. Kanda ku murongo kugira ngo ubikore.'],
    },
    {
      target: 'coach-tabs', title: ['Menu', 'Ibikubiyemo'],
      body: ['Move between Home, your squad, camps and updates.', "Jya ahabanza, ku ikipe yawe, ku makambi no ku makuru."],
    },
    {
      target: 'help', title: ['Tour again', 'Ongera urebe ubusobanuro'],
      body: ['Tap "?" on any screen to see its tour again.', 'Kanda "?" kuri paji iyo ari yo yose kugira ngo wongere urebe ubusobanuro bwayo.'],
    },
  ],
  'coach-squad': [
    {
      target: 'add-player', title: ['Add your players', 'Ongeramo abakinnyi bawe'],
      body: ['Add each player once with name and birth year. Parent details are optional for now.',
             "Ongeramo buri mukinnyi rimwe, ufite izina n'umwaka w'amavuko. Amakuru y'umubyeyi si ngombwa ubu."],
    },
    {
      target: 'squad-list', title: ['Your squad', 'Ikipe yawe'],
      body: ['Every player shows his age group and where he stands. Tap a player to see his pathway, results, staff messages and certificates.',
             "Buri mukinnyi agaragaza icyiciro cy'imyaka n'aho ageze. Kanda ku mukinnyi urebe urugendo rwe, ibisubizo, ubutumwa n'ibyemezo."],
    },
  ],
  'coach-camps': [
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
      body: ['Invitations and results from TFEP staff arrive here. Tap one to open it.',
             "Ubutumire n'ibisubizo bivuye ku bakozi ba TFEP biza hano. Kanda kuri kimwe ukifungure."],
    },
  ],
}
