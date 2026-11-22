/**
 * Callsigns (SPEC §3): every run's Behemoth gets one, drawn from the run seed. Each is a true name
 * of a devil or demon from history: the spirits of the *Ars Goetia* (the 17th-century *Lesser Key
 * of Solomon*), Collin de Plancy's *Dictionnaire Infernal* (1818), Jewish and Christian scripture
 * and lore, and older Mesopotamian, Persian, Egyptian, and Japanese traditions. `note` is a short
 * line on who the name belonged to (it fits one line of the map's side panel).
 */

export interface Callsign {
  name: string;
  /** Where the name comes from. */
  source: string;
  /** Who or what it was, in a few words. */
  note: string;
}

export const CALLSIGNS: readonly Callsign[] = [
  // The Ars Goetia's 72 spirits (the warlike and the strange).
  { name: 'Bael', source: 'Ars Goetia', note: 'First king of the Goetia' },
  { name: 'Agares', source: 'Ars Goetia', note: 'Duke who brings earthquakes' },
  { name: 'Vassago', source: 'Ars Goetia', note: 'Prince who finds lost things' },
  { name: 'Marbas', source: 'Ars Goetia', note: 'President in a lion\'s shape' },
  { name: 'Valefor', source: 'Ars Goetia', note: 'Duke of thieves' },
  { name: 'Amon', source: 'Ars Goetia', note: 'Marquis, a fire-breathing wolf' },
  { name: 'Barbatos', source: 'Ars Goetia', note: 'Duke who speaks with beasts' },
  { name: 'Paimon', source: 'Ars Goetia', note: 'King who rides a dromedary' },
  { name: 'Buer', source: 'Ars Goetia', note: 'President, a wheel of legs' },
  { name: 'Beleth', source: 'Ars Goetia', note: 'King on a pale horse' },
  { name: 'Leraje', source: 'Ars Goetia', note: 'Marquis, archer of battles' },
  { name: 'Eligos', source: 'Ars Goetia', note: 'Duke who knows of wars' },
  { name: 'Zepar', source: 'Ars Goetia', note: 'Duke in red armor' },
  { name: 'Botis', source: 'Ars Goetia', note: 'Earl in a viper\'s shape' },
  { name: 'Bathin', source: 'Ars Goetia', note: 'Duke on a pale horse' },
  { name: 'Purson', source: 'Ars Goetia', note: 'King who rides a bear' },
  { name: 'Naberius', source: 'Ars Goetia', note: 'Marquis, a three-headed dog' },
  { name: 'Glasya-Labolas', source: 'Ars Goetia', note: 'Captain of all manslayers' },
  { name: 'Bune', source: 'Ars Goetia', note: 'Duke, a three-headed dragon' },
  { name: 'Berith', source: 'Ars Goetia', note: 'Duke, a red soldier' },
  { name: 'Astaroth', source: 'Ars Goetia', note: 'Duke who rides a dragon' },
  { name: 'Forneus', source: 'Ars Goetia', note: 'Marquis, a sea monster' },
  { name: 'Asmoday', source: 'Ars Goetia', note: 'Three-headed king' },
  { name: 'Furfur', source: 'Ars Goetia', note: 'Earl who raises thunder' },
  { name: 'Marchosias', source: 'Ars Goetia', note: 'Marquis, a winged wolf' },
  { name: 'Stolas', source: 'Ars Goetia', note: 'Prince in an owl\'s shape' },
  { name: 'Phenex', source: 'Ars Goetia', note: 'Marquis, a phoenix' },
  { name: 'Halphas', source: 'Ars Goetia', note: 'Earl who arms towers' },
  { name: 'Malphas', source: 'Ars Goetia', note: 'Throws down enemy walls' },
  { name: 'Raum', source: 'Ars Goetia', note: 'Earl who destroys cities' },
  { name: 'Focalor', source: 'Ars Goetia', note: 'Duke who sinks warships' },
  { name: 'Vepar', source: 'Ars Goetia', note: 'Duke of storms at sea' },
  { name: 'Sabnock', source: 'Ars Goetia', note: 'Marquis who fortifies cities' },
  { name: 'Shax', source: 'Ars Goetia', note: 'Marquis who steals sight' },
  { name: 'Vine', source: 'Ars Goetia', note: 'King who breaks stone walls' },
  { name: 'Haagenti', source: 'Ars Goetia', note: 'President who transmutes metal' },
  { name: 'Balam', source: 'Ars Goetia', note: 'Three-headed king on a bear' },
  { name: 'Alloces', source: 'Ars Goetia', note: 'Duke, a lion-faced rider' },
  { name: 'Murmur', source: 'Ars Goetia', note: 'Duke on a griffin' },
  { name: 'Andras', source: 'Ars Goetia', note: 'Marquis who sows discord' },
  { name: 'Kimaris', source: 'Ars Goetia', note: 'Marquis, a warrior on black' },
  { name: 'Belial', source: 'Ars Goetia', note: 'King made after Lucifer' },
  { name: 'Decarabia', source: 'Ars Goetia', note: 'Marquis in a star\'s shape' },
  { name: 'Dantalion', source: 'Ars Goetia', note: 'Duke of many faces' },
  { name: 'Andromalius', source: 'Ars Goetia', note: 'Earl who punishes thieves' },
  { name: 'Zagan', source: 'Ars Goetia', note: 'King, a winged bull' },
  { name: 'Amdusias', source: 'Ars Goetia', note: 'Duke, a unicorn' },
  { name: 'Flauros', source: 'Ars Goetia', note: 'Duke who burns his enemies' },
  // Scripture and Jewish and Christian lore.
  { name: 'Abaddon', source: 'Book of Revelation', note: 'Angel of the abyss' },
  { name: 'Azazel', source: 'Book of Enoch', note: 'Taught men to forge swords' },
  { name: 'Moloch', source: 'Hebrew Bible', note: 'Idol fed with fire' },
  { name: 'Mammon', source: 'Gospels', note: 'Demon of greed' },
  { name: 'Beelzebub', source: 'Hebrew Bible', note: 'Lord of the flies' },
  { name: 'Asmodeus', source: 'Book of Tobit', note: 'King of demons' },
  { name: 'Leviathan', source: 'Hebrew Bible', note: 'Serpent of the deep' },
  { name: 'Rahab', source: 'Hebrew Bible', note: 'Demon of the sea' },
  { name: 'Mastema', source: 'Book of Jubilees', note: 'Chief of evil spirits' },
  { name: 'Samael', source: 'Talmud', note: 'The venom of God' },
  { name: 'Lilith', source: 'Jewish folklore', note: 'Demon of the night' },
  { name: 'Belphegor', source: 'Binsfeld, 1589', note: 'Prince of sloth' },
  { name: 'Mephistopheles', source: 'Faust legend', note: 'Devil who bargains souls' },
  // The Dictionnaire Infernal.
  { name: 'Adramelech', source: 'Dictionnaire Infernal', note: 'Chancellor of hell' },
  { name: 'Ukobach', source: 'Dictionnaire Infernal', note: 'Stoker of hell\'s furnaces' },
  { name: 'Abraxas', source: 'Dictionnaire Infernal', note: 'Gnostic power, made a demon' },
  { name: 'Haborym', source: 'Dictionnaire Infernal', note: 'Duke who sets cities ablaze' },
  // Older traditions.
  { name: 'Pazuzu', source: 'Assyria', note: 'King of the wind demons' },
  { name: 'Lamashtu', source: 'Mesopotamia', note: 'Demoness of plague' },
  { name: 'Asag', source: 'Sumer', note: 'Led an army of stones' },
  { name: 'Aeshma', source: 'Zoroastrian', note: 'Demon of wrath' },
  { name: 'Ahriman', source: 'Zoroastrian', note: 'The destructive spirit' },
  { name: 'Apep', source: 'Egypt', note: 'Serpent of chaos' },
  { name: 'Shuten-doji', source: 'Japan', note: 'King of the oni' },
];
