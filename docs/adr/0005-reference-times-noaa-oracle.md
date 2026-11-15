# ADR-0005: Reference prayer times — Diyanet, Aladhan and a NOAA oracle

## Status
Accepted (owner decision, 2026-11-14)

## Date
2026-11-14

## Context
The brief asks for calculated times within ±2 minutes of reference tables (Schaumburg, İstanbul, a high-latitude city). The Aladhan API's Schaumburg Asr in late January was ~1.7 min early against NOAA solar-position maths, so it disagreed with the more accurate adhan-js value by 3 minutes on one day.

## Decision
- İstanbul: Diyanet's published table (±2 min).
- Oslo June under each high-latitude rule: Aladhan (±2 min).
- Schaumburg, İstanbul and Mecca for every day of 2026, ISNA and Turkey, both madhabs: an in-repo NOAA solar-position oracle (`tests/helpers/solarOracle.ts`), ±90 s (adhan rounds to the minute and its Asr runs up to ~88 s from NOAA in winter at 42°N).

## Consequences
- Observed: İstanbul Asr up to 2 min from Diyanet; a +1/+2 min Asr offset matches Diyanet exactly. Owners should compare with their mosque for a week and set offsets.
