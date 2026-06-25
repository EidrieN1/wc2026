// flag: cod ISO 3166-1 alpha-2 pentru flagcdn.com
// Scoția = gb-sct, Anglia = gb-eng (nu au cod ISO standard)
export const MATCHES = [
  // ── 23 IUNIE ─────────────────────────────────────────────────────────────
  { id:  1, group:"Grupa I",    home:"Franța",         homef:"fr", away:"Irak",              awayf:"iq", date:"23 Iun", kickoff:"2026-06-23T00:00:00" },
  { id:  2, group:"Grupa I",    home:"Norvegia",       homef:"no", away:"Senegal",            awayf:"sn", date:"23 Iun", kickoff:"2026-06-23T03:00:00" },
  { id:  3, group:"Grupa J",    home:"Iordania",       homef:"jo", away:"Algeria",            awayf:"dz", date:"23 Iun", kickoff:"2026-06-23T06:00:00" },
  { id:  4, group:"Grupa K",    home:"Portugalia",     homef:"pt", away:"Uzbekistan",         awayf:"uz", date:"23 Iun", kickoff:"2026-06-23T20:00:00" },
  { id:  5, group:"Grupa L",    home:"Anglia",         homef:"gb-eng", away:"Ghana",          awayf:"gh", date:"23 Iun", kickoff:"2026-06-23T23:00:00" },
  // ── 24 IUNIE ─────────────────────────────────────────────────────────────
  { id:  6, group:"Grupa L",    home:"Panama",         homef:"pa", away:"Croația",            awayf:"hr", date:"24 Iun", kickoff:"2026-06-24T02:00:00" },
  { id:  7, group:"Grupa K",    home:"Columbia",       homef:"co", away:"RD Congo",           awayf:"cd", date:"24 Iun", kickoff:"2026-06-24T05:00:00" },
  { id:  8, group:"Grupa B",    home:"Elveția",        homef:"ch", away:"Canada",             awayf:"ca", date:"24 Iun", kickoff:"2026-06-24T22:00:00" },
  { id:  9, group:"Grupa B",    home:"Bosnia-Herț.",   homef:"ba", away:"Qatar",              awayf:"qa", date:"24 Iun", kickoff:"2026-06-24T22:00:00" },
  // ── 25 IUNIE ─────────────────────────────────────────────────────────────
  { id: 10, group:"Grupa C",    home:"Scoția",         homef:"gb-sct", away:"Brazilia",       awayf:"br", date:"25 Iun", kickoff:"2026-06-25T01:00:00" },
  { id: 11, group:"Grupa C",    home:"Maroc",          homef:"ma", away:"Haiti",              awayf:"ht", date:"25 Iun", kickoff:"2026-06-25T01:00:00" },
  { id: 12, group:"Grupa A",    home:"Cehia",          homef:"cz", away:"Mexic",              awayf:"mx", date:"25 Iun", kickoff:"2026-06-25T04:00:00" },
  { id: 13, group:"Grupa A",    home:"Africa de Sud",  homef:"za", away:"Coreea de Sud",      awayf:"kr", date:"25 Iun", kickoff:"2026-06-25T04:00:00" },
  { id: 14, group:"Grupa E",    home:"Curaçao",        homef:"cw", away:"Coasta de Fildeș",   awayf:"ci", date:"25 Iun", kickoff:"2026-06-25T23:00:00" },
  { id: 15, group:"Grupa E",    home:"Ecuador",        homef:"ec", away:"Germania",           awayf:"de", date:"25 Iun", kickoff:"2026-06-25T23:00:00" },
  // ── 26 IUNIE ─────────────────────────────────────────────────────────────
  { id: 16, group:"Grupa F",    home:"Japonia",        homef:"jp", away:"Suedia",             awayf:"se", date:"26 Iun", kickoff:"2026-06-26T02:00:00" },
  { id: 17, group:"Grupa F",    home:"Tunisia",        homef:"tn", away:"Olanda",             awayf:"nl", date:"26 Iun", kickoff:"2026-06-26T02:00:00" },
  { id: 18, group:"Grupa D",    home:"Turcia",         homef:"tr", away:"SUA",                awayf:"us", date:"26 Iun", kickoff:"2026-06-26T05:00:00" },
  { id: 19, group:"Grupa D",    home:"Paraguay",       homef:"py", away:"Australia",          awayf:"au", date:"26 Iun", kickoff:"2026-06-26T05:00:00" },
  { id: 20, group:"Grupa I",    home:"Norvegia",       homef:"no", away:"Franța",             awayf:"fr", date:"26 Iun", kickoff:"2026-06-26T22:00:00" },
  { id: 21, group:"Grupa I",    home:"Senegal",        homef:"sn", away:"Irak",               awayf:"iq", date:"26 Iun", kickoff:"2026-06-26T22:00:00" },
  // ── 27 IUNIE ─────────────────────────────────────────────────────────────
  { id: 22, group:"Grupa H",    home:"Capul Verde",    homef:"cv", away:"Arabia Saudită",     awayf:"sa", date:"27 Iun", kickoff:"2026-06-27T03:00:00" },
  { id: 23, group:"Grupa H",    home:"Uruguay",        homef:"uy", away:"Spania",             awayf:"es", date:"27 Iun", kickoff:"2026-06-27T03:00:00" },
  { id: 24, group:"Grupa G",    home:"Egipt",          homef:"eg", away:"Iran",               awayf:"ir", date:"27 Iun", kickoff:"2026-06-27T06:00:00" },
  { id: 25, group:"Grupa G",    home:"Noua Zeelandă",  homef:"nz", away:"Belgia",             awayf:"be", date:"27 Iun", kickoff:"2026-06-27T06:00:00" },
  // ── 28 IUNIE ─────────────────────────────────────────────────────────────
  { id: 26, group:"Grupa L",    home:"Croația",        homef:"hr", away:"Ghana",              awayf:"gh", date:"28 Iun", kickoff:"2026-06-28T00:00:00" },
  { id: 27, group:"Grupa L",    home:"Panama",         homef:"pa", away:"Anglia",             awayf:"gb-eng", date:"28 Iun", kickoff:"2026-06-28T00:00:00" },
  { id: 28, group:"Grupa K",    home:"Columbia",       homef:"co", away:"Portugalia",         awayf:"pt", date:"28 Iun", kickoff:"2026-06-28T02:30:00" },
  { id: 29, group:"Grupa K",    home:"RD Congo",       homef:"cd", away:"Uzbekistan",         awayf:"uz", date:"28 Iun", kickoff:"2026-06-28T02:30:00" },
  { id: 30, group:"Grupa J",    home:"Algeria",        homef:"dz", away:"Austria",            awayf:"at", date:"28 Iun", kickoff:"2026-06-28T05:00:00" },
  { id: 31, group:"Grupa J",    home:"Iordania",       homef:"jo", away:"Argentina",          awayf:"ar", date:"28 Iun", kickoff:"2026-06-28T05:00:00" },
  // ── 16-IMI ───────────────────────────────────────────────────────────────
  { id: 32, group:"16-imi",     home:"1 Grupa A",      homef:"", away:"2 Grupa B",            awayf:"", date:"29 Iun", kickoff:"2026-06-29T02:00:00" },
  { id: 33, group:"16-imi",     home:"1 Grupa B",      homef:"", away:"2 Grupa A",            awayf:"", date:"29 Iun", kickoff:"2026-06-29T22:00:00" },
  { id: 34, group:"16-imi",     home:"1 Grupa C",      homef:"", away:"Locul 3",              awayf:"", date:"30 Iun", kickoff:"2026-06-30T02:00:00" },
  { id: 35, group:"16-imi",     home:"1 Grupa D",      homef:"", away:"2 Grupa C",            awayf:"", date:"30 Iun", kickoff:"2026-06-30T22:00:00" },
  { id: 36, group:"16-imi",     home:"1 Grupa E",      homef:"", away:"Locul 3",              awayf:"", date:"1 Iul",  kickoff:"2026-07-01T02:00:00" },
  { id: 37, group:"16-imi",     home:"1 Grupa F",      homef:"", away:"2 Grupa E",            awayf:"", date:"1 Iul",  kickoff:"2026-07-01T22:00:00" },
  { id: 38, group:"16-imi",     home:"1 Grupa G",      homef:"", away:"Locul 3",              awayf:"", date:"2 Iul",  kickoff:"2026-07-02T02:00:00" },
  { id: 39, group:"16-imi",     home:"1 Grupa H",      homef:"", away:"2 Grupa G",            awayf:"", date:"2 Iul",  kickoff:"2026-07-02T22:00:00" },
  { id: 40, group:"16-imi",     home:"1 Grupa I",      homef:"", away:"Locul 3",              awayf:"", date:"3 Iul",  kickoff:"2026-07-03T02:00:00" },
  { id: 41, group:"16-imi",     home:"1 Grupa J",      homef:"", away:"2 Grupa I",            awayf:"", date:"3 Iul",  kickoff:"2026-07-03T22:00:00" },
  { id: 42, group:"16-imi",     home:"1 Grupa K",      homef:"", away:"Locul 3",              awayf:"", date:"4 Iul",  kickoff:"2026-07-04T02:00:00" },
  { id: 43, group:"16-imi",     home:"1 Grupa L",      homef:"", away:"2 Grupa K",            awayf:"", date:"4 Iul",  kickoff:"2026-07-04T22:00:00" },
  { id: 44, group:"16-imi",     home:"2 Grupa D",      homef:"", away:"2 Grupa F",            awayf:"", date:"5 Iul",  kickoff:"2026-07-05T02:00:00" },
  { id: 45, group:"16-imi",     home:"2 Grupa H",      homef:"", away:"2 Grupa J",            awayf:"", date:"5 Iul",  kickoff:"2026-07-05T22:00:00" },
  { id: 46, group:"16-imi",     home:"2 Grupa L",      homef:"", away:"Locul 3",              awayf:"", date:"6 Iul",  kickoff:"2026-07-06T02:00:00" },
  { id: 47, group:"16-imi",     home:"2 Grupa K",      homef:"", away:"2 Grupa L",            awayf:"", date:"6 Iul",  kickoff:"2026-07-06T22:00:00" },
  // ── OPTIMI ───────────────────────────────────────────────────────────────
  { id: 48, group:"Optimi",     home:"Câșt. M1",       homef:"", away:"Câșt. M2",             awayf:"", date:"7 Iul",  kickoff:"2026-07-07T02:00:00" },
  { id: 49, group:"Optimi",     home:"Câșt. M3",       homef:"", away:"Câșt. M4",             awayf:"", date:"7 Iul",  kickoff:"2026-07-07T22:00:00" },
  { id: 50, group:"Optimi",     home:"Câșt. M5",       homef:"", away:"Câșt. M6",             awayf:"", date:"8 Iul",  kickoff:"2026-07-08T02:00:00" },
  { id: 51, group:"Optimi",     home:"Câșt. M7",       homef:"", away:"Câșt. M8",             awayf:"", date:"8 Iul",  kickoff:"2026-07-08T22:00:00" },
  { id: 52, group:"Optimi",     home:"Câșt. M9",       homef:"", away:"Câșt. M10",            awayf:"", date:"9 Iul",  kickoff:"2026-07-09T02:00:00" },
  { id: 53, group:"Optimi",     home:"Câșt. M11",      homef:"", away:"Câșt. M12",            awayf:"", date:"9 Iul",  kickoff:"2026-07-09T22:00:00" },
  { id: 54, group:"Optimi",     home:"Câșt. M13",      homef:"", away:"Câșt. M14",            awayf:"", date:"10 Iul", kickoff:"2026-07-10T02:00:00" },
  { id: 55, group:"Optimi",     home:"Câșt. M15",      homef:"", away:"Câșt. M16",            awayf:"", date:"10 Iul", kickoff:"2026-07-10T22:00:00" },
  // ── SFERTURI ─────────────────────────────────────────────────────────────
  { id: 56, group:"Sferturi",   home:"Câșt. Opt. 1",   homef:"", away:"Câșt. Opt. 2",         awayf:"", date:"11 Iul", kickoff:"2026-07-11T22:00:00" },
  { id: 57, group:"Sferturi",   home:"Câșt. Opt. 3",   homef:"", away:"Câșt. Opt. 4",         awayf:"", date:"12 Iul", kickoff:"2026-07-12T02:00:00" },
  { id: 58, group:"Sferturi",   home:"Câșt. Opt. 5",   homef:"", away:"Câșt. Opt. 6",         awayf:"", date:"12 Iul", kickoff:"2026-07-12T22:00:00" },
  { id: 59, group:"Sferturi",   home:"Câșt. Opt. 7",   homef:"", away:"Câșt. Opt. 8",         awayf:"", date:"13 Iul", kickoff:"2026-07-13T02:00:00" },
  // ── SEMIFINALE ───────────────────────────────────────────────────────────
  { id: 60, group:"Semifinale", home:"Câșt. Sf. 1",    homef:"", away:"Câșt. Sf. 2",          awayf:"", date:"15 Iul", kickoff:"2026-07-15T22:00:00" },
  { id: 61, group:"Semifinale", home:"Câșt. Sf. 3",    homef:"", away:"Câșt. Sf. 4",          awayf:"", date:"16 Iul", kickoff:"2026-07-16T22:00:00" },
  // ── FINALE ───────────────────────────────────────────────────────────────
  { id: 62, group:"Finală mică",home:"Perd. SF1",       homef:"", away:"Perd. SF2",            awayf:"", date:"19 Iul", kickoff:"2026-07-19T00:00:00" },
  { id: 63, group:"Finală mare",home:"Câșt. SF1",       homef:"", away:"Câșt. SF2",            awayf:"", date:"19 Iul", kickoff:"2026-07-19T22:00:00" },
]
