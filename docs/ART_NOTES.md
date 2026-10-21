# Art notes

## Sculpted limbs: where else to use them

`shapedLimb` (src/kits/bake3d/gait.ts) draws a bone as a lofted shape instead of a plain tube. A profile of girths along its length lets it swell where muscle sits and taper away, `flat` squashes it, and `keel` gives it a ridge. With `footAt` and `jointBetween` (planted feet, joints placed between hip and foot), it made the T3 mother's legs and neck read as anatomy, not "identical shaped pipes" (the user, 2026-10-21).

Most models still use plain `limb` tubes. Candidates, roughly most visible first (counted 2026-10-21):

- **Humans (Meadowfolk `human()` in body.ts; 34 plain limbs across body.ts and index.ts).** Thighs and calves, upper arms and forearms, the neck. They're the most-seen units, so this would make the biggest difference. Calf muscle, a tapering forearm, and trousers and boots that swell and pinch.
- **Mounts and wildlife (`quadLegs` in Meadowfolk body.ts, `legs` in kits/animals.ts).** A horse's or lynx's leg is the classic case: a heavy, muscled forearm and gaskin over thin cannons. One change here upgrades every four-legged animal at once, wildlife included.
- **Fenfolk (32 plain limbs, plus 9 in rig.ts).** The herons' long legs and S-necks (a thin shank, a feathered thigh, a neck swelling at its base), the bog toad's big hind legs, the pack tortoise's pillar legs, and the fenlings' frog legs in rig.ts.
- **The new faction's other units:**
  - the chargers' and the Whipweld's thighs (now a tube plus a bulge sphere);
  - the Goliath's mech legs (thin segments with a flat or keeled section);
  - the Vimmer's wing spars and the Dragon Fly's legs;
  - the Whipweld's whip arms, which could thin smoothly to the tip instead of stepping down segment by segment.
- **Lower-tier mothers:** they already share the T3 mother's model, so they have it.

It's per-model work, but cheap: swap `limb(a, b, r, mat, r2)` for `shapedLimb(c, a, b, r, [profile], mat, { flat, keel, up })`. Each shaped bone is a loft rather than a tube, so a few more triangles per bone. That's baked into sprites, so it costs nothing at runtime.
