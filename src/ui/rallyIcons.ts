// The side rally points' icons (a basket for work, a sword for the army), as SVG path data in a 24×24 box: drawn as
// outlines on the HUD's buttons (ui/hud.ts) and on the badges over the rally flags in the world (render/renderer.ts).
export const RALLY_ICONS: Record<'work' | 'army', string[]> = {
  work: ['M7 10a5 5 0 0 1 10 0', 'M3 10h18l-2.2 10H5.2z', 'M4 14.5h16M8.5 10l.8 10M12 10v10M15.5 10l-.8 10'],
  army: ['M12 2l2 2.5V15h-4V4.5z', 'M7 15h10M12 15v4.5', 'M10.8 21a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0'],
};
