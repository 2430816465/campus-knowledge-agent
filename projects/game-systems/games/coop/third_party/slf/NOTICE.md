# Imported maps — Super Lemonade Factory OUYA

Copyright: Initials Video Games and the original map contributors.
Source: https://github.com/initials/SuperLemonadeFactoryOUYA (master)
License: GNU GPL version 3; full text in LICENSE.

72 editable source maps from data/SLF_levelEditor/PC are preserved in maps/.
Registry.as.reference.txt records the original runtime's map embedding paths.
Backup maps, Ogmo's older export folder, cinematics 101/113/125, and editor test maps are not counted as additional playable levels.

Adaptation date: 2026-10-02. The importer scales every logical map coordinate uniformly by 1.4, retains platform/hazard placement, small crates, breakable crates, path nodes, patrol bounds, collectibles and exit placement. Original portraits, commercial branding, dialogue, music, and decorative fake floors are not used. Decorative fake floors are excluded to avoid showing walkable surfaces without collision.

The current heroes and newly drawn obstacle art are used instead of the original art. New server-authoritative mechanics implement the maps in this project's JavaScript architecture; downloaded ActionScript programs are never executed.

Converted maps in src/imported-maps.js and adaptations in src/imported-engine.js are supplied under GPL-3.0. Preserve this notice, original editable maps, license, importer and corresponding modified source when distributing this adaptation. A root repository license is not a separate negotiated commercial license. Closed-source Douyin distribution has not been cleared with the rights holder; this import does not settle the licensing scope of a combined release.

No official connection or endorsement by Initials Video Games is claimed.
