// The diary's words (SPEC 8.1, 12.2): the log as the kid would write it in their notebook. First person
// ("I", "me", "my", from the survivor's name and pronouns), and in their own voice: short, plain, now
// and then excited. A phrasebook turns the narration's lines into a kid's; anything it doesn't know is
// still put into the first person. Thoughts lose their quotes: they're the kid's own words already.

/** Words after which "her" is the person ("gave her"), not whose ("her hands"). */
const AFTER_ME = new Set(['and', 'again', 'to', 'in', 'on', 'at', 'off', 'up', 'down', 'away', 'out', 'back', 'no', 'with', 'for', 'from', 'before', 'as', 'a', 'an', 'the', 'over', 'into', 'by', 'so', 'but', 'or', 'all', 'anyway']);

/** What comes before a name that starts a clause: the start, a stop or comma, or a joining word. */
const CLAUSE_START = /(^|[.,;:!?—]\s*|\b(?:and|but|so|then|what|when|while|until|as|that|because|if|before|after)\s+)$/;

/** The line in the first person, for a survivor called `name`. */
export function firstPerson(text: string, name: string, gender: 'boy' | 'girl'): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The name: "I" where it starts a clause ("Mira woke", "..., and Mira went"), "me" where something is
  // done to them ("the cold took Mira").
  let t = text
    .replace(new RegExp(`\\b${esc}'s\\b`, 'g'), 'my')
    .replace(new RegExp(`\\b${esc}\\b`, 'g'), (_m, at: number, all: string) => (CLAUSE_START.test(all.slice(0, at)) ? 'I' : 'me'));
  if (gender === 'girl') {
    t = t
      .replace(/\bherself\b/g, 'myself')
      .replace(/\b[Ss]he\b/g, 'I')
      .replace(/\b([Hh])er\b(\W*)(\w*)/g, (_m, h: string, gap: string, next: string) => {
        const me = !next || /[.,;:!?]/.test(gap) || AFTER_ME.has(next.toLowerCase());
        return `${me ? 'me' : h === 'H' ? 'My' : 'my'}${gap}${next}`;
      });
  } else {
    t = t
      .replace(/\bhimself\b/g, 'myself')
      .replace(/\b[Hh]e\b/g, 'I')
      .replace(/\bHis\b/g, 'My')
      .replace(/\bhis\b/g, 'my')
      .replace(/\bhim\b/g, 'me');
  }
  return t
    .replace(/\bI is\b/g, 'I am')
    .replace(/\bI has\b/g, 'I have')
    .replace(/\bI does\b/g, 'I do')
    .replace(/(^|[.!?]\s+)my\b/g, (_m, a: string) => `${a}My`)
    .replace(/(^|[.!?]\s+)me\b/g, (_m, a: string) => `${a}Me`);
}

type Rule = [RegExp, string];

/**
 * The phrasebook: a line (already in the first person) as the kid would write it. `$1` and the like are
 * the line's own things ("the glossy red berries"). First match wins.
 */
const PHRASES: Rule[] = [
  // The weather and its signs.
  [/^The cloud broke up and the sky cleared\.$/, 'Sky cleared up.'],
  [/^Cloud came over the peaks\.$/, 'Clouds coming over the mountains.'],
  [/^Fog crept in off the lake\.$/, "Foggy. Couldn't see much."],
  [/^A thin drizzle began to fall\.$/, 'Drizzly.'],
  [/^It began to rain\.$/, 'Started raining.'],
  [/^Thunder rolled down the valley\. The storm broke\.$/, 'THUNDERSTORM. So loud.'],
  [/^The wind picked up, tearing at everything\.$/, 'Super windy. Everything flapping around.'],
  [/^The sky went dark as evening\..*$/, 'The sky went dark in the middle of the day. Something really bad is coming.'],
  [/^The wind swung round to blow off the lake\.$/, "Wind changed. It's coming off the lake now."],
  [/^There was a ring round the moon\.$/, 'Ring around the moon tonight.'],
  [/^The marmots went to ground early\.$/, 'The marmots hid early today.'],
  [/^The sky was red at dawn\.$/, 'Red sky this morning.'],
  [/^High, streaky cloud combed across the sky\.$/, 'Streaky clouds way up high.'],
  [/^Smoke and mist hung low over the water\.$/, 'Misty over the water.'],
  [/^The insects were biting hard\.$/, 'Bugs biting like crazy.'],
  [/^Snow had fallen on the high peaks\.$/, "Snow on the mountains! It's getting colder."],
  [/^It was snowing\.$/, "It's snowing."],
  [/^Snow lay down to the lake\. Winter had come\.$/, "Snow all the way down to the lake. Winter's here."],
  // Sleep, and how the body feels.
  [/^I woke\.$/, 'Woke up.'],
  [/^I woke with a dry mouth and a pounding head\.$/, 'Woke up so thirsty. Head pounding.'],
  [/^I woke shivering\.$/, 'Woke up freezing.'],
  [/^I lay down to sleep\.$/, 'Went to sleep.'],
  [/^I sat and rested\.$/, 'Sat down for a rest.'],
  [/^I could not keep my eyes open, and slept where I fell\.$/, "Couldn't stay awake. Fell asleep right there."],
  [/^I was shivering hard\.$/, "So cold. Can't stop shivering."],
  [/^My stomach ached with hunger\.$/, 'So hungry my stomach hurts.'],
  [/^My mouth was dry\.$/, 'Really thirsty.'],
  [/^I could barely keep going\.$/, 'Totally worn out.'],
  [/^The worst of the tiredness had lifted\.$/, 'Feeling less tired.'],
  [/^The queasiness had passed\.$/, 'Stomach feels better now.'],
  [/^Lying awake before dawn, I turned things over in my mind\.$/, "Couldn't sleep. Kept thinking about stuff."],
  [/^Cramps knotted my stomach\. Something I drank days ago\.$/, 'Bad stomach cramps. Must be something I drank.'],
  [/^I thought back\. Most of my water had come from (.+)\.$/, 'I think it was $1. That is where I got most of my water.'],
  // Tasting and eating.
  [/^I put a little of the (.+) on my tongue, and waited\.$/, 'Tried a tiny bit of the $1. Waited to see what happens.'],
  [/^The (.+) had done me no harm\.$/, 'The $1 seem OK. Nothing bad happened.'],
  [/^My stomach turned over\. The (.+) were not good to eat\.$/, "Felt sick. DON'T eat the $1."],
  [/^My tongue went numb and my gut clenched\. The (.+) were dangerous\.$/, 'My tongue went numb!! The $1 are DANGEROUS. Never again.'],
  [/^The (.+) sat well\. They were good food\.$/, 'The $1 were good. Real food!'],
  [/^The (.+) filled my stomach but did little for me\.$/, "The $1 filled me up but it didn't really help."],
  [/^I was sick\. It was the (.+)\.$/, 'Threw up. It was the $1.'],
  [/^Cramps doubled me over\. The (.+) were poison\.$/, 'Awful cramps. The $1 are POISON.'],
  [/^My stomach rebelled\. It had been raw\.$/, 'Stomach hurts. Should have cooked it.'],
  [/^Jays dropped down and ate the (.+)\.$/, 'Saw jays eating the $1. Maybe they are OK?'],
  [/^Birds came and went, and left the (.+) alone\.$/, "The birds won't touch the $1. Weird."],
  [/^The (.+) had gone bad\. I threw (?:them|it) away\.$/, 'The $1 went bad. Had to throw it out.'],
  // Fire.
  [/^The tinder caught\. A thread of smoke, a flicker, then flame\. I had fire\.$/, 'FIRE!!! The tinder caught and I MADE FIRE!!'],
  [/^The tinder smoked a long time before it caught, but I had a fire going\.$/, 'Took forever but I got a fire going.'],
  [/^I got a fire going\.$/, 'Got a fire going.'],
  [/^I tried to light the (.+), but it would not catch\.$/, "The $1 won't catch. Need something better."],
  [/^I worked the bow drill until my arms burned\. The (.+) only smoked; no coal came\.$/, 'Bow drill on the $1 until my arms hurt. Only smoke. Ugh.'],
  [/^The fire had burned down to coals\.$/, 'Fire burned down to coals.'],
  [/^The fire went out\.$/, 'Fire went out.'],
  [/^Steel on the (.+) threw a spray of sparks\..*$/, 'The $1 makes SPARKS when I hit it with steel!'],
  [/^Steel on the (.+) threw a few thin sparks\..*$/, 'The $1 makes a few little sparks.'],
  [/^The (.+) crumbled under the steel\.$/, 'The $1 just crumbles. Useless.'],
  [/^Nothing came of striking the (.+)\.$/, 'Hitting the $1 does nothing.'],
  [/^The (.+) flaked under the steel, leaving an edge like glass\.$/, 'The $1 chips into a really sharp edge.'],
  [/^Lightning struck high on the slope\. Something up there was burning\.$/, 'Lightning hit up on the mountain. Something is burning up there!'],
  [/^The water boiled\.$/, 'Water boiled.'],
  // Animals.
  [/^A grouse burst out from almost underfoot and whirred away\.$/, 'A bird exploded out from right by my feet. Scared me!'],
  [/^A marmot whistled, sharp and high\. Everything nearby went still\.$/, 'A marmot whistled really loud and everything went quiet.'],
  [/^A jay dropped down and stripped a beakful of berries\. It came back for more\.$/, 'A jay ate some berries. Then came back for more.'],
  [/^The (.+) caught the scent of a person and slipped away\.$/, 'Saw a $1. It smelled me and ran off.'],
  [/^From a distance, the (.+) was seen to bristle at a passing jay\. It (.+)\.$/, 'Watched the $1 from far away. A jay went by and it $2.'],
  [/^Backing away slowly, step by step, put enough room between them\. The (.+) let it go\.$/, 'Backed away really slowly. The $1 let me go. Heart pounding.'],
  [/^The shouting worked\. The (.+) turned and went\.$/, 'I yelled and the $1 left!'],
  [/^Facing it, not moving, it was the (.+) that gave way\. It turned and went\.$/, "I stood my ground and the $1 backed off."],
  [/^The (.+) would not come near the fire\. It turned and went\.$/, "The $1 won't come near the fire."],
  [/^(?:The|A) (.+) charged\. I was knocked down and hurt\.$/, 'The $1 CHARGED me. Got knocked down. It hurts.'],
  [/^Something was following me\. I never quite saw it\.$/, "Something's following me. I never see it."],
  [/^I blundered into a porcupine\. Quills, a dozen of them\.$/, 'Walked right into a porcupine. OW. Quills everywhere.'],
  [/^Goats picked their way up through the cliffs, one ledge at a time\. There was a way up there\.$/, 'Saw goats climbing the cliffs. There must be a way up!'],
  [/^Something was caught in the snare\.$/, 'Something in the snare!'],
  [/^The stream was thick with trout, nosing upstream over the gravel\. The run had come\.$/, 'The stream is FULL of fish!'],
  // Hazards.
  [/^Mosquitoes came off the water in a whining cloud\. I was bitten all over\.$/, 'Mosquitoes everywhere. Bitten all over. So itchy.'],
  [/^The ground shifted underfoot\. I fell hard and turned an ankle\.$/, 'Fell and twisted my ankle.'],
  [/^I slipped and went under, came up gasping in the icy water\.$/, 'Slipped and went under. FREEZING.'],
  [/^A foot went wrong on the wet log, and I went into the stream\.$/, 'Slipped off the log into the stream. Everything is wet. Even this notebook.'],
  [/^Up here the sun was fierce\. My face and neck were burning\.$/, 'Sunburned my face and neck.'],
  [/^I had nothing left\. Every step was an effort\.$/, 'So tired. Every step is hard.'],
  [/^A whole day in camp\. I felt caged\.$/, 'Stuck in camp all day. So bored.'],
  [/^The wound had turned hot and swollen\. I was feverish\.$/, 'The cut is red and puffy. I feel hot. Not good.'],
  // Things noticed.
  [/^Somewhere ahead, water was falling.*$/, 'Heard a waterfall!'],
  [/^A dead tree stood split down the middle.*$/, 'Found a tree split down the middle, all black inside. Lightning?'],
  [/^Something pale lay scattered in the grass ahead\. Bones, old and clean\.$/, 'Bones in the grass. Old ones. Creepy.'],
  [/^A whole slope of trees lay flattened.*$/, 'A whole slope of trees knocked flat. Avalanche?'],
  [/^A small still lake lay cupped in the rock.*$/, 'Found a little lake up in the rocks. Super clear.'],
  [/^The rock ahead had a hole clean through it.*$/, 'A rock with a hole right through it!'],
  [/^Sticks and mud were piled across the water ahead.*$/, 'Sticks and mud piled across the water. Beavers?'],
  [/^A bad smell came on the air, and the hum of flies\. Something dead lay in the water\.$/, 'Something dead in the water. It STINKS.'],
  [/^A dead elk lay rotting in the water\. (.+) was fouled\.$/, 'A dead elk rotting in the water. Gross. $1 is bad water now.'],
  [/^Beavers had dammed the water here\. Below a beaver pond, (.+) could not be clean\.$/, "Beavers dammed it. $1 can't be clean below that."],
  [/^Something dark and tangled lay at the edge of the water\.$/, 'Something tangled washed up by the water.'],
  [/^A scrap of bright colour had washed up on the shore\.$/, 'Something bright washed up on the shore!'],
  [/^Something on the shore flashed in the light, and flashed again\.$/, 'Something shiny on the shore!'],
  // Small things.
  [/^There was no way through to there\.$/, "Can't get through there."],
  [/^It was too dark to see\.$/, 'Too dark to see anything.'],
  [/^My hands and pockets were full\.$/, 'My pockets are full.'],
  [/^My hands and pockets were full, so I set (.+) down at my feet\.$/, 'Pockets full. Put $1 down.'],
  [/^There was nothing more here for now\.$/, 'Nothing left here for now.'],
  [/^I knew one thing already, from home: (.+), (.+)\.$/, 'One thing I know from home: $1 is $2.'],
  [/^I searched the broken nose of the plane again\. There was nothing more to take\.$/, 'Checked the plane again. Nothing left.'],
];

/** I did something: in a diary, the "I" usually goes ("Found 3 sticks."). */
const DROP_I = /^I (found|picked up|gathered|made|cut|ate|drank|put down|tried|got|caught|speared|killed|filled|cooked|boiled|washed|pulled|threw|shouted|stabbed|blew|buried|wrapped|hung|pried|finished|took|set|cleaned|skinned|gutted|plucked) /;

/** A log line as the kid writes it in the diary. */
export function diaryLine(text: string, name: string, gender: 'boy' | 'girl'): string {
  // Thoughts are the kid's own words already: just without the quotes.
  if (/^[“"].*[”"]$/.test(text)) return text.slice(1, -1);
  const t = firstPerson(text, name, gender);
  for (const [re, out] of PHRASES) if (re.test(t)) return t.replace(re, out);
  return t.replace(DROP_I, (_m, verb: string) => `${verb[0]!.toUpperCase()}${verb.slice(1)} `);
}
