"use strict";

function calculateCashbackAmount(baseTicketPrice, config, random = Math.random) {
  const {
    skewLevel = 3,
    minNPR = 5,
    maxNPR = 30,
    maxPercentOfTicket = 15,
    lowTicketThreshold = 100,
    lowTicketMaxPercent = 10,
  } = config;
  const skewFactor = 1 + (5 - skewLevel) * 0.5;
  const weightedRandom = Math.pow(random(), skewFactor);
  let cashback = Math.round(minNPR + weightedRandom * (maxNPR - minNPR));
  const percentage =
    baseTicketPrice < lowTicketThreshold
      ? lowTicketMaxPercent
      : maxPercentOfTicket;
  cashback = Math.min(cashback, Math.floor((baseTicketPrice * percentage) / 100));
  cashback = Math.max(cashback, minNPR);
  return Math.min(cashback, maxNPR);
}

function selectScratchCardTheme(themes, random = Math.random) {
  const fallback = { name: "Default", imageKey: null };
  if (!Array.isArray(themes)) return fallback;
  const active = themes.filter((theme) => theme.isActive && theme.imageKey);
  if (active.length === 0) return fallback;
  const totalWeight = active.reduce((sum, theme) => sum + (theme.weight || 1), 0);
  const roll = random() * totalWeight;
  let cumulative = 0;
  for (const theme of active) {
    cumulative += theme.weight || 1;
    if (roll < cumulative) {
      return { name: theme.name, imageKey: theme.imageKey };
    }
  }
  return fallback;
}

module.exports = { calculateCashbackAmount, selectScratchCardTheme };
