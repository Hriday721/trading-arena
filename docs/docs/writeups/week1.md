# Week 1: building a stock exchange's order book from scratch

I'm building Trading Arena, a browser game where your orders really move the market. Stop-losses get hunted, big players leave footprints, and you learn why most traders lose. This week was the engine under all of it.

## What I built

A TypeScript order book that works like a real exchange in miniature:

- Limit, market and stop orders, with cancel and modify
- Price-time priority: the best price fills first, and at the same price the earlier order wins
- A depth ladder with mid price, built on price levels so a book of 10,000 orders stays fast (resting them takes about [X] ms on my laptop)
- Validation with tick size and lot size, returning clear reject reasons instead of crashing
- An event log, so any match can be replayed exactly

65 automated tests pass. The best one is a stop hunt with nothing scripted: one 15-share market sell breaks support, hidden stop-losses fire, and the price falls from ₹100.00 to ₹98.50, mostly from the retail stops.

## One decision, and why

I log the orders players send, not the trades that result. Trades, stop triggers and prices are all consequences of the orders, so replaying the orders rebuilds the same match. That gives me debrief replays, fair duels on the same seed, and dispute checks later. It only works because the engine has no randomness or clock inside it.

## One bug I fixed

My GitHub contribution graph stayed empty for two days even though I was pushing code. The cause was a typo in my commit email, so GitHub could not match my commits to my account. I corrected the email and rewrote the two commits, and the contributions appeared.

## Next

Week 2: a simulated clock, scenarios, trading bots and candles, so the book finally has a market around it.

