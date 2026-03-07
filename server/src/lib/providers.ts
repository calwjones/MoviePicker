export function getProviderBaseName(name: string): string {
  return name
    .replace(/\+/g, ' Plus')
    .replace(/ with Ads$/i, '')
    .replace(/ (Amazon|Apple TV) Channel$/i, '')
    .replace(/ (Basic|Standard|Premium|Ad[- ]?Free)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
