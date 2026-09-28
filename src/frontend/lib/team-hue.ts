export function getTeamHue(teamName: string) {
  return [...teamName].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) % 360,
    0,
  );
}

export function getTeamHueBackground(teamName: string) {
  const hue = getTeamHue(teamName);
  const complementaryHue = (hue + 180) % 360;
  return `linear-gradient(110deg, hsl(${hue} 55% 22% / 0.72) 0%, hsl(${complementaryHue} 42% 13% / 0.38) 58%, transparent 100%)`;
}
