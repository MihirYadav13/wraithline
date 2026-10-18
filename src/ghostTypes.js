export const EVIDENCE = {
  EMF: 'EMF Level 5',
  BOX: 'Spirit Box',
  PRINTS: 'Fingerprints',
  WRITING: 'Ghost Writing',
  FREEZE: 'Freezing Temps',
  ORBS: 'Ghost Orbs',
};

const base = {
  huntThreshold: 50,
  speed: 1.7,
  activity: 1,
  throwMult: 1,
  blinkOn: 0.6,
  eventDrain: 10,
  incenseBlock: 90,
  crucifixRange: 3,
  huntCooldown: 25,
  quietSteps: false,
};

const T = (name, ev, desc, mods = {}) => ({ name, ev, desc, ...base, ...mods });

export const GHOST_TYPES = [
  T('Spirit', ['EMF', 'BOX', 'WRITING'], 'A common restless dead. Incense keeps it from hunting for twice as long.', { incenseBlock: 180 }),
  T('Wraith', ['EMF', 'BOX', 'FREEZE'], 'Glides rather than walks. Its footsteps are almost silent during a hunt.', { quietSteps: true }),
  T('Phantom', ['BOX', 'PRINTS', 'ORBS'], 'Seeing it shatters the mind. Hard to spot while it hunts — it blinks out for longer.', { blinkOn: 0.3, eventDrain: 18 }),
  T('Poltergeist', ['BOX', 'PRINTS', 'WRITING'], 'Noisy and violent. Hurls objects across rooms far more often and harder.', { throwMult: 2.5, activity: 1.3 }),
  T('Banshee', ['PRINTS', 'ORBS', 'FREEZE'], 'Lets out a distinctive wail. Hunts slightly earlier than most.', { huntThreshold: 55 }),
  T('Jinn', ['EMF', 'PRINTS', 'FREEZE'], 'Territorial and fast over long distances when it can see its prey.', { speed: 1.9 }),
  T('Mare', ['BOX', 'ORBS', 'WRITING'], 'Draws power from darkness. Loves switching lights off; hunts at 60% sanity.', { huntThreshold: 60 }),
  T('Revenant', ['ORBS', 'WRITING', 'FREEZE'], 'Crawls slowly while searching, but runs you down once it sees you.', { speed: 1.0 }),
  T('Shade', ['EMF', 'WRITING', 'FREEZE'], 'Shy. Very little activity and only hunts at 35% sanity.', { huntThreshold: 35, activity: 0.6 }),
  T('Demon', ['PRINTS', 'WRITING', 'FREEZE'], 'The most aggressive. Hunts at 70% sanity, recovers quickly and resists crucifixes less... at 5 m.', { huntThreshold: 70, huntCooldown: 15, crucifixRange: 5 }),
  T('Yurei', ['BOX', 'ORBS', 'FREEZE'], 'Feeds on fear. Its apparitions drain much more sanity and it slams doors.', { eventDrain: 16 }),
  T('Oni', ['EMF', 'ORBS', 'FREEZE'], 'Loves to show itself. Very active and appears far more often.', { activity: 1.6 }),
];

export const FIRST_NAMES = ['Margaret', 'Edward', 'Agnes', 'Thomas', 'Eleanor', 'Walter', 'Dorothy', 'Henry', 'Ruth', 'Samuel', 'Clara', 'Arthur', 'Lucy', 'George', 'Ada', 'Victor'];
export const LAST_NAMES = ['Holloway', 'Ashford', 'Blackwood', 'Grimsby', 'Whitlock', 'Marsh', 'Crane', 'Thorne', 'Pryce', 'Hale', 'Vance', 'Morrow'];

export const SPIRIT_BOX_LINES = ['Here', 'Behind you', 'Leave', 'Death', 'Close', 'Get out', 'Mine', 'Kill', 'Away', 'I am here', 'Hate', 'Old', 'Child', 'Run'];
