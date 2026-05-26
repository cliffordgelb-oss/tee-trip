export function slugify(input, { max = 40 } = {}) {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

export function randomSuffix(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len)
}
