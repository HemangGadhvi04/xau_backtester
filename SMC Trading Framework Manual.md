# **Algorithmic Smart Money Concepts: An Exhaustive Framework for XAUUSD Intraday Trading**

## **Core Philosophy**

The foundational premise of the Smart Money Concepts (SMC) and algorithmic price delivery framework rests upon the absolute understanding that financial markets do not move organically or randomly. Rather, price delivery is engineered by sophisticated institutional algorithms designed with two primary directives: to seek liquidity and to rebalance structural inefficiencies. Institutional entities require massive counter-party liquidity to execute large orders without causing excessive market impact. Consequently, price action is continually manipulated to induce retail participation, trigger stop-loss orders, and accumulate positions at a deep discount before distributing them at a premium.  
This document establishes a strictly mechanical, fully quantifiable, and rule-based intraday and scalping framework tailored explicitly for Gold (XAUUSD), while remaining structurally adaptable to foreign exchange pairs and equity indices. Discretionary analysis, emotional bias, and subjective chart patterns are systematically eliminated in favor of a quantitative, checklist-based execution model. Furthermore, this framework is optimized for modern proprietary trading firm compliance. In the current landscape, successfully securing and maintaining institutional capital requires navigating rigorous parameters, including consistency algorithms, minimum hold times, and strict macroeconomic news blackout windows. Success in this domain demands unyielding adherence to mechanical execution, treating the trading process as an operational business rather than a speculative endeavor.

## **Market Structure Framework**

Market structure serves as the paramount directional compass for algorithmic price delivery. The accurate hierarchical mapping of external dealing ranges and their internal structural fluctuations dictates the overarching bias and subsequent trade execution.

### **Structural Classification and Dealing Range Logic**

The market moves in continuous expansions and retracements. Understanding the hierarchy of these movements is critical for avoiding false signals.

* **External Structure:** This represents the macro swings that form the broader dealing range. It is defined by the highest absolute high and the lowest absolute low that resulted in a validated structural break on the higher timeframe. The external structure dictates the macro draw on liquidity.  
* **Internal Structure:** These are the micro price action movements contained entirely within the current external dealing range. Internal structure facilitates the complex pullbacks necessary to mitigate higher-timeframe Points of Interest (POIs) such as order blocks or imbalances.  
* **Swing Highs and Swing Lows:** A mechanically valid swing high consists of a minimum three-candle sequence where the central candle possesses a higher high and a higher low than the specific candles on its immediate left and right. A swing low requires a central candle with a lower low and lower high than its adjacent neighbors.  
* **BOS (Break of Structure):** A pro-trend continuation signal. To be validated, the body of the execution timeframe candle must close decisively beyond the preceding external swing high (in a bullish trend) or swing low (in a bearish trend).  
* **CHOCH (Change of Character):** This represents the very first internal indication of a potential trend reversal. A CHOCH occurs when the price breaks the last internal swing point that directly caused the most recent external high or low. It is an early warning system, not a definitive reversal signal.  
* **MSS (Market Structure Shift):** The definitive, confirmed structural reversal signal. An MSS is characterized by aggressive displacement through a key external structural level, confirming that institutional order flow has fundamentally altered its direction.  
* **Displacement:** A high-momentum, impulsive price delivery consisting of large-bodied, unidirectional candles with minimal wicks. Displacement must leave behind Fair Value Gaps (FVGs), indicating aggressive, unbalanced institutional participation where counter-party orders were overwhelmed.  
* **Protected Highs/Lows:** These represent the true origin of a structural break. In a bullish market structure, the specific low that initiated the sequence resulting in a higher high is deemed protected; institutional algorithms are expected to defend this level.  
* **Weak Highs/Lows:** Swing points that fail to accomplish a structural objective. A high that fails to break a protected low or sweep significant liquidity is classified as a weak high. Weak highs and lows serve as high-probability targets for future price runs.  
* **Premium and Discount Zones:** These zones are mathematically calculated using a standard Fibonacci retracement tool mapped from the validated dealing range low to the dealing range high. The Discount zone is defined strictly as the area below the 50% equilibrium threshold, while the Premium zone is the area above the 50% threshold.  
* **Dealing Range Logic:** The algorithm continuously moves price from a discount to a premium, and vice versa. Institutional accumulation occurs exclusively in a discount, while distribution occurs exclusively in a premium.

### **Validation Rules and Invalidation Parameters**

Structural breaks are only validated by a full candle body close on the designated timeframe. If a candle merely pierces a structural point with its wick and subsequently closes back inside the previous range, the event is mechanically classified as a liquidity sweep (stop hunt) rather than a structural break.  
A pervasive beginner mistake involves misidentifying an internal CHOCH as a major external trend reversal. Traders often attempt to trade a CHOCH that occurs in the middle of a dealing range (equilibrium), resulting in executing trades directly into the prevailing macro trend.  
**Mechanical Rule for Structural Bias:** A bullish structural bias is designated as valid only when the price breaks a significant external swing high with obvious displacement, leaves an imbalance (FVG), and subsequently holds above the protected origin low of that displacement leg. Any violation of the origin low immediately invalidates the bullish thesis.

## **Bias Framework**

Bias formulation cannot rely on a single timeframe. It requires a top-down analytical cascade, synchronizing macro delivery objectives with micro execution triggers.

### **Multi-Timeframe Matrix**

| Timeframe | Analytical Function | Key Elements Assessed |
| :---- | :---- | :---- |
| **Daily (1D)** | Macro Direction & Draw on Liquidity | Daily highs/lows, macro PD arrays, major external liquidity pools. |
| **4-Hour (4H)** | Major Structure & Dealing Range | External BOS/MSS, premium/discount zones, HTF order blocks. |
| **1-Hour (1H)** | Intraday Bias & Range Context | Previous day highs/lows (PDH/PDL), Asian session ranges, daily open. |
| **15-Minute (15M)** | Setup Formation & Inducement | Internal liquidity sweeps, session timing, local FVGs, intermediate structure. |
| **5M / 1M** | Execution Trigger | LTF MSS, clear displacement, refined order blocks, precise entry points. |

### **Intraday Bias Determination**

The intraday Draw on Liquidity (DOL) identifies the path of least resistance for the algorithm. The analysis mandates the continuous assessment of specific daily levels: Previous Day High/Low, Previous Week High/Low, Asian Session High/Low, London High/Low, the Daily Open price, and the Weekly Open price. Alignment with higher-timeframe order blocks and FVGs dictates the strength of the bias. Furthermore, the timing of high-impact news events heavily influences whether the bias will be realized quickly or delayed.  
**The Mechanical Bias Decision Tree:**  
The framework utilizes a sequential interrogative process to establish the daily bias:

1. Is the current price located in a higher-timeframe Premium or Discount zone?  
2. Has significant higher-timeframe liquidity recently been swept?  
3. Following the sweep, has energetic displacement occurred toward the opposing liquidity pool?  
4. Has a true Market Structure Shift (MSS) been confirmed via a body close?  
5. Is the price currently retracing to a valid, unmitigated entry zone (FVG or Order Block)?  
6. Is the target liquidity pool logically accessible without major intervening higher-timeframe support/resistance?

**Bias Categorization Definitions:**  
The output of the decision tree results in one of four actionable states. A **Bullish** state requires that the higher timeframe indicates a draw to higher liquidity, the price is currently trading within a 4H or 1H discount zone, and sell-side liquidity has recently been neutralized. A **Bearish** state requires that the draw is to lower liquidity, the price resides in a premium zone, and buy-side liquidity has been raided. A **Neutral** state is declared when the price is consolidating aggressively around the 50% equilibrium level of a major dealing range without clear displacement. Finally, a **No-trade** state is enforced when price action exhibits high volatility with massive bidirectional wicks lacking structural breaks, or when the market is within the immediate approach of a tier-one fundamental data release.

## **Liquidity Framework**

Liquidity serves as the underlying magnetic force dictating all algorithmic price delivery. The framework categorizes liquidity based on the behavioral patterns and stop-loss placement of retail and traditional institutional market participants.

### **Comprehensive Liquidity Classification**

* **Buy-Side Liquidity (BSL):** Pools of buy stop orders resting above old highs, traditional resistance levels, or engineered equal highs. These orders belong to breakout traders entering long, and short sellers placing stop-losses.  
* **Sell-Side Liquidity (SSL):** Pools of sell stop orders resting below old lows, traditional support levels, or engineered equal lows. These represent breakdown traders and the stop-losses of long participants.  
* **Equal Highs (EQH) and Equal Lows (EQL):** Highly engineered structural features designed explicitly to induce retail traders into believing a solid level of support or resistance exists. These are exceptionally high-probability algorithmic targets.  
* **Previous Day/Week Highs and Lows (PDH/PDL, PWH/PWL):** Natural structural extremes that attract significant order accumulation across trading sessions.  
* **Session Highs/Lows:** The specific extremes established during the Asian, London, and New York trading sessions, heavily utilized for intraday targeting.  
* **Trendline and Retail Support/Resistance Liquidity:** Obvious diagonal or horizontal levels widely taught in traditional technical analysis. The algorithm aggressively targets the dense stop-loss clusters built up behind these structures.  
* **Internal vs. External Liquidity:** Internal liquidity comprises the minor swing points and FVGs contained within a larger dealing range. External liquidity comprises the major swing highs and lows that define the boundaries of that range. The standard algorithmic model sweeps internal liquidity to fuel a run toward external liquidity, and upon raiding external liquidity, reverses to sweep internal liquidity.  
* **Inducement:** A minor swing high or low deliberately engineered just prior to a major institutional Point of Interest (POI). Retail traders are induced to enter the market early based on this minor structure, placing their stop-losses directly at the true institutional POI. The algorithm sweeps the inducement to tap the POI.  
* **Stop Hunts and Liquidity Raids:** Purposeful, rapid price spikes through known liquidity pools specifically designed to trigger pending orders and capture counter-party liquidity before reversing into the true directional bias.  
* **Liquidity Voids:** Areas of the chart characterized by massive, one-sided price movement where no trading occurred on the opposing side, creating a vacuum that price often rapidly fills.

### **Rules for Liquidity Validation and Execution**

The framework strictly separates high-probability liquidity from low-probability liquidity. High-probability liquidity includes unmitigated EQH/EQL, PDH/PDL, and session extremes that align logically with the higher-timeframe Draw on Liquidity. Low-probability liquidity consists of minor, choppy swing points located in the equilibrium (middle) of a dealing range, which are often ignored or chopped through randomly.  
Identifying the draw on liquidity requires assessing which liquidity pool is mathematically closest and structurally unprotected. A liquidity sweep is only deemed valid when the price pierces the targeted level but violently rejects it, leaving a prominent wick and closing the candle body firmly back inside the established range. If the candle closes full-bodied beyond the level and the subsequent candle continues the momentum, it is classified as a genuine breakout, and reversal models are voided.  
A critical distinction exists between an internal liquidity raid before a continuation and an external raid before a reversal. An internal raid typically sweeps an inducement level to tap an order block, leading to a strong trend continuation. Conversely, an external raid pierces the absolute high or low of the macro dealing range, signaling a potential macro reversal if followed by an immediate structural shift.  
**Mechanical Rule for Liquidity:** No market entry is legally permitted within this framework until an obvious, structurally significant liquidity pool has been clearly engineered and subsequently swept. Entering prematurely, anticipating a move before the liquidity is taken, mathematically transforms the trader's position into the liquidity itself.

## **Entry Models**

The framework utilizes seven highly specific, rule-based entry models. Execution requires strict, unyielding adherence to the defined criteria; partial or imperfect setups are immediately disqualified from execution.

### **Entry Model 1: Liquidity Sweep \+ MSS \+ FVG Entry**

This model targets the fundamental institutional reversal footprint following a major stop hunt.

* **Market Condition Required:** The market must be in a clearly defined trend approaching a major extreme, or operating within a broad consolidation range targeting the boundaries.  
* **Bias Required:** The setup must align with the higher-timeframe Draw on Liquidity.  
* **Liquidity Condition:** Obvious Buy-Side or Sell-Side liquidity must be unequivocally swept via a candlestick wick, indicating a trap.  
* **Structure Condition:** An internal Market Structure Shift (MSS) must occur immediately subsequent to the sweep, confirming the reversal of institutional order flow. Strong displacement is mandatory.  
* **Entry Trigger:** A Limit Order is placed precisely at the proximal edge of the Fair Value Gap (FVG) generated during the displacement leg. Crucially, this entry must mathematically reside within the discount zone (for long positions) or the premium zone (for short positions) of the newly formed dealing range.  
* **Stop-Loss Placement:** Placed logically 1.5 to 2.0 pips/points beyond the absolute extreme wick of the initial liquidity sweep.  
* **Take-Profit Logic:** Targeted at the opposing external liquidity pool.  
* **Invalidation:** If the opposing FVG is completely filled and closed through with a candle body before the entry limit order is triggered, the thesis is voided.  
* **Best Session & Timeframe:** London or NY Overlap. 15M sweep paired with a 1M/5M entry.  
* **Common Mistake:** Executing on an FVG that lacks genuine displacement, or where the structure shift is merely a minor internal CHOCH rather than a confirmed MSS.

### **Entry Model 2: Order Block Retest Entry**

This model capitalizes on the mitigation of institutional orders left in drawdown during a structural shift.

* **Validity of an Order Block:** An Order Block (OB) is the last up-candle before a strong down move (bearish), or the last down-candle before a strong up move (bullish). A high-quality OB is validated *only* if it directly sweeps liquidity prior to its formation and directly causes a structural break with displacement. Low-quality OBs form in equilibrium without sweeping liquidity and are ignored.  
* **Market Condition Required:** Trending environment initiating a pullback.  
* **Entry Trigger:** Entry occurs upon the mitigation (retest) of the OB. Limit orders can be placed at the full OB open, or, for wider blocks, at the 50% Mean Threshold to optimize risk-to-reward metrics. Refined lower-timeframe OBs nested within the higher-timeframe OB offer the highest precision.  
* **Stop-Loss Placement:** Placed beyond the distal edge of the Order Block.  
* **Take-Profit Logic:** Targeted at the next unmitigated liquidity pool in the direction of the trend.  
* **Invalidation:** A full candle body close beyond the distal edge of the OB invalidates the block.

### **Entry Model 3: Breaker Block Entry**

This model exploits the momentum of trapped traders when a proven Order Block fails.

* **Breaker Mechanics:** A Bullish Breaker is a former bearish Order Block that previously resulted in a lower low (sweeping liquidity) but was subsequently overpowered and broken to the upside with strong displacement. A Bearish Breaker is the inverse.  
* **Condition for Strength:** A Breaker Block is mathematically stronger than a standard Order Block when an aggressive, obvious stop hunt (liquidity sweep) has just occurred, trapping significant volume on the wrong side of the market.  
* **Entry Trigger:** A retest of the upper boundary (for bullish) or lower boundary (for bearish) of the Breaker Block.  
* **Stop-Loss Logic:** Placed securely below/above the extreme of the specific candle that broke through the block.  
* **Target Logic:** The opposing structural extreme.

### **Entry Model 4: FVG Continuation Entry**

This model is designed for rapid execution within highly impulsive, trending markets where deeper pullbacks to Order Blocks do not manifest.

* **Mechanics:** A Fair Value Gap represents an imbalance consisting of a three-candle sequence where the wicks of the first and third candles fail to overlap, leaving a void of price action.  
* **Continuation vs. Reversal:** A continuation setup utilizes FVGs formed in the direction of the macro trend after internal liquidity is swept. Reversal setups utilize FVGs formed during the initial displacement away from an external macro sweep.  
* **Entry Rules:** Enter at the exact open of the FVG. If the FVG is exceptionally large (indicating massive volatility), the entry limit must be placed at Consequent Encroachment (the precise 50% midpoint of the gap).  
* **Invalidation:** A FVG is considered "too old" if price consolidates extensively before returning to it. The setup is definitively invalidated if a candle body closes beyond the 50% midpoint of the FVG, signaling that the algorithmic support has failed.

### **Entry Model 5: Judas Swing / Session Raid Entry**

This model systematically exploits the opening algorithmic manipulation of major trading sessions.

* **Model Logic:** The algorithm routinely engineers an Asian session consolidation range. Upon the London open, price aggressively manipulates in the opposite direction of the true daily bias to sweep the Asian High/Low, inducing retail breakout traders and hunting stops. This false move is the "Judas Swing."  
* **London Judas Setup:** Wait for the London open to violently sweep the Asian High. Confirm a 1M/5M bearish MSS back inside the range. Enter short on the resulting FVG/OB, targeting the Asian Low.  
* **New York Judas Setup:** Follows identical mechanics, typically manipulating the London High or Low immediately upon the NY open.  
* **Gold-Specific Timing:** The highest probability Judas swings on Gold occur precisely at 08:30 EST alongside minor data releases, or at the exact 08:00 EST London-NY overlap opening minute.  
* **Exclusion Rules:** This model is strictly prohibited if the Asian range was highly expansive and directional rather than consolidated, or if high-impact fundamental news is scheduled within the next 30 minutes.

### **Entry Model 6: Turtle Soup / False Breakout Entry**

A purely mechanical framework for fading obvious retail breakouts.

* **Mechanics:** The model requires a false breakout above a highly visible old daily or weekly high, or a false breakdown below an old low.  
* **Entry Trigger:** Execution is entirely reactive. As price rallies above the old high, no action is taken. The precise moment the price violently drops back *below* the exact price level of the old high (reclaiming the level), an immediate market entry is executed, validated by a 1-minute candle close below the reclaimed line.  
* **Stop-Loss:** Placed just beyond the extreme wick of the newly created false breakout raid.  
* **Target:** The opposite side of the structural dealing range.

### **Entry Model 7: Continuation Pullback After Liquidity Raid**

This model provides pro-trend execution following an internal algorithmic shakeout.

* **Mechanics:** In a well-established higher-timeframe trend, price sharply retraces to sweep internal liquidity (a minor swing low or an explicitly engineered inducement).  
* **Entry Trigger:** Following the internal sweep, price taps into a macro discount array (such as a 1H Order Block). Re-entry in the direction of the macro trend is triggered upon a lower-timeframe MSS.  
* **Stop-Loss:** Placed tightly below the newly formed internal sweep extreme.  
* **Target:** The untouched external higher-timeframe swing high.

## **Exit Models**

The extraction of capital requires an exit framework as rigid and systematic as the entry protocols. Discretionary exits based on emotional comfort inevitably degrade statistical expectancy.

### **Exit Framework Parameters**

* **Fixed R Exits vs. Structural Targets:** While Fixed Risk-to-Reward (e.g., exiting automatically at 1:3R) provides mathematical stability, the algorithmic model dictates that exits must be mapped to opposing structural liquidity points. Targets include Previous Highs/Lows, engineered Equal Highs/Lows, unmitigated HTF Order Blocks, and prominent Session Highs/Lows.  
* **Partial Profit Rules:** A mandatory partial exit of 50% of the position volume is executed exactly at a 1:2 Risk-to-Reward ratio *only* under the condition that the price has not yet reached the primary external liquidity target. If the external liquidity target is situated closer than the 1:2R threshold, the full position must be liquidated at the liquidity target without taking partials.  
* **ATR and Daily Range Targets:** If the instrument has already expanded to fulfill its Average True Range (ATR) for the day during the London session, New York setups must dynamically target tighter internal liquidity rather than expecting continued, statistically improbable macro expansion.  
* **Time-Based Exits:** All active intraday positions must be forcefully terminated prior to the daily rollover period (17:00 EST for Gold) due to severe liquidity withdrawal and spread expansion, and strictly before the release of high-impact fundamental data.  
* **Failed Displacement Rule:** If an entry limit is triggered, but subsequent price action fails to displace in the anticipated direction, instead lapsing into low-volume consolidation for more than five execution-timeframe candles, the trade must be manually exited at market price or breakeven. The algorithmic delivery mechanism has stalled, and the statistical edge is voided.

## **Stop-Loss Rules**

Risk containment through precise stop-loss placement is the ultimate defense mechanism against account ruin. Stop-loss parameters are anchored exclusively to structural invalidation points, never to arbitrary monetary or pip-based limits.

### **Systematic Stop-Loss Placement**

* **Beyond Liquidity Sweeps:** For reversal models, the stop is placed unequivocally beyond the extreme wick of the initial liquidity sweep. If the market breaches this wick, the entire thesis of institutional manipulation is fundamentally incorrect.  
* **Beyond POIs:** For continuation models, stops are placed beyond the distal edge of the Order Block, FVG, or Breaker Block that serves as the basis for entry.  
* **Structure-Based Stops:** Stops must always be protected by a valid structural barrier (e.g., placing a stop below the origin of an MSS displacement leg).  
* **The Gold (XAUUSD) Spread Buffer:** Gold is characterized by extreme intraday volatility and dynamic spreads. Placing a stop precisely on the structural pip guarantees premature stop-outs during temporary illiquidity spikes. Therefore, a mandatory spread and volatility buffer of 15 to 20 pips (1.5 to 2.0 full points) must be added mathematically to the absolute structural invalidation point.  
* **Rule for Invalid Stops:** A stop-loss is defined as mathematically 'too tight' if it rests precisely on the structure point without the requisite asset-specific spread buffer. It is defined as 'too wide' if it extends beyond the origin of the broader dealing range, thereby destroying the necessary risk-to-reward asymmetry. Candle body closes dictate structural shifts, but wicks dictate stop-loss hits; therefore, stops must survive the wicks.

## **Risk Management Framework**

To secure, maintain, and scale capital from modern proprietary trading firms, risk parameters must aggressively insulate the account against statistical variance, psychological deterioration, and the rigid automated consistency algorithms employed by these firms.

### **Proprietary Firm Compliance and Statistical Parameters**

| Risk Parameter | Specification and Rule |
| :---- | :---- |
| **Risk per Trade** | Fixed rigorously between 0.25% to 0.50% of the initial account balance. |
| **Daily Max Loss** | Trading operations cease immediately upon reaching a 2.0% daily drawdown. This internal hard stop mathematically prevents triggering the prop firm's actual daily loss limits (typically set between 4% and 5%). |
| **Max Trades per Day** | Capped at a maximum of 4 executions per rolling 24-hour period. |
| **Losing Streak Limit** | A hard stop is enforced for the remainder of the session after 2 consecutive maximum-risk losses. |

**The Prop Firm Consistency Algorithms:** Many top-tier proprietary firms demand that a single day's profit does not comprise an overwhelming percentage of the total account profit, utilizing this metric to identify and eliminate reckless gambling behavior.1 This is mathematically calculated using the Consistency Rule formula:  
![][image1]  
Firms typically enforce a 20% or 30% consistency threshold.2 For example, if a trader's best single day yields $1,000 in profit, and the total accumulated profit across the period is $3,000, the best day represents 33.3% of the total, constituting a breach of a 30% consistency rule.2 To rectify a breach, traders must utilize the Fix Formula:  
![][image2]  
If the best day was $1,000 and the firm requires 50% consistency, the total balance needed to meet consistency is $2,000 ($1,000 / 0.50).4  
**Prop-Firm Safe Execution Model Rules:** To avoid flagging the compliance algorithms, the framework strictly prohibits massive lot size spikes.2 Position sizing must remain statistically uniform across all executions. Averaging down (Martingale), grid trading, and latency arbitrage are unconditionally banned.  
Crucially, minimum holding times are strictly enforced. Proprietary firms routinely audit for micro-scalping; profits generated from trades held for less than 2 minutes are frequently voided entirely, while any losses incurred under 2 minutes remain fully applicable to the account drawdown.6 Therefore, a mandatory 120-second minimum hold time is integrated into the trade management protocol. Following exceptionally large wins or large losses, risk is mechanically halved (reduced to 0.125%) for the subsequent execution to stabilize equity curve volatility and prevent revenge trading or euphoria-induced over-leveraging.

## **Time and Session Framework**

The algorithmic delivery of Gold (XAUUSD) is intrinsically linked to the opening and closing cycles of major global financial centers. Execution is strictly confined to designated high-probability temporal windows, known as Killzones.

### **Global Session Matrix and Characteristics**

| Session / Killzone | EST Schedule | UTC Schedule | Market Characteristics and Algorithmic Behavior |
| :---- | :---- | :---- | :---- |
| **Asian Session** | 19:00 – 04:00 | 00:00 – 09:00 | Characterized by the lowest volatility and narrow ranges. The algorithm utilizes this session to engineer initial intraday structure and build liquidity pools for later sweeps.11 |
| **London Killzone** | 02:00 – 05:00 | 07:00 – 10:00 | High probability window for the formation of the daily high or low. Aggressive opening manipulation (Judas swings) sweeps Asian liquidity.11 |
| **NY AM Killzone** | 07:00 – 10:00 | 12:00 – 15:00 | Period of major structural displacement driven by massive institutional volume and US economic data releases.9 |
| **London-NY Overlap** | 08:00 – 12:00 | 13:00 – 17:00 | Peak daily volatility and tightest spreads. Produces the largest and most sustained directional price movements of the trading day.10 |
| **NY PM Session** | 13:00 – 16:00 | 18:00 – 21:00 | Slower continuation moves or late-day reversals. Volume tapers significantly as the London close passes.8 |
| **Daily Rollover** | \~17:00 | \~22:00 | Systematic execution blackout. Spreads widen exponentially, causing severe slippage and unpredictable order execution.12 |

**Session-Specific Execution Rules:** The optimal time to trade Gold is exclusively during the London-New York overlap window, where liquidity and volatility perfectly align.10 Trading during the Asian session is statistically inferior and generally avoided, as price action tends to be choppy and unreliably slow.13 Reversals are highly probable during the London open (sweeping Asian limits) and the NY open (sweeping London limits). Continuations are highly probable deep into the NY AM session following the initial opening volatility. The lunch period (12:00-13:00 EST) is avoided as volume drops, leading to false breakouts.

## **News Filter**

Fundamental macroeconomic data acts as the volatile catalyst for algorithmic price delivery, rapidly expanding ranges to reach higher-timeframe liquidity targets. However, executing during these events is mathematically destructive and frequently violates proprietary firm regulations.

### **High-Impact Data Classification**

The framework flags the following "Red Folder" events as severe volatility catalysts: CPI (Consumer Price Index), NFP (Non-Farm Payrolls), FOMC Rate Decisions and Press Conferences, Fed Chair Speeches, Interest Rate Decisions, PPI, GDP announcements, Unemployment Claims, Retail Sales, ISM/PMI data, Core PCE, and sudden geopolitical shock events.

### **The 2-Minute Compliance Rule and Execution Mechanics**

Proprietary trading firms actively monitor and penalize directional gambling around high-impact news releases. A strict prohibition dictates that no trades may be executed—which includes opening a position, closing a position manually, or having a position closed via an automated Stop-Loss or Take-Profit order—within a window of 2 minutes prior to, and 2 minutes immediately following, a scheduled high-impact news event.7 Certain firms extend this to a 5-minute window.6  
**News Execution Policy:**

1. All active intraday positions must be completely liquidated at market price a minimum of 5 minutes prior to the scheduled data release.  
2. If managing a higher-timeframe swing position acquired well before the news window, the stop-loss must be secured at breakeven, and the trader must accept the statistical risk of severe negative slippage bypassing the stop order.  
3. During the exact minute of the news release, massive spread widening renders technical levels irrelevant. The initial, highly erratic candlestick is categorically ignored by the framework; this is pure "News Manipulation."  
4. Trading operations only resume after a post-news structure (a clear, new dealing range with validated MSS) has been established, typically requiring 15 to 30 minutes of stabilization after the release. Displacement directly driven by the news spike itself is considered unreliable until a secondary structural confirmation occurs.

## **Trade Management Rules**

Rigid trade management protocols bridge the gap between theoretical edge and realized equity, dictating exactly how a position is handled from entry to termination.

### **Systematic Management Protocols**

* **Entry Confirmation:** An entry is only valid if the pending limit order is triggered. Market execution is prohibited unless utilizing the Turtle Soup reactive model.  
* **Breakeven Rules:** The stop-loss is relocated to breakeven (plus the cost of spread) *strictly* only after the price has successfully swept an internal liquidity point in the intended direction and generated a secondary structural break (BOS). Moving the stop to breakeven prematurely out of fear guarantees being stopped out by natural algorithmic pullbacks.  
* **Re-entry Rules:** If a trade is stopped out purely due to a deeper liquidity sweep, but the higher-timeframe bias and setup parameters remain perfectly intact, one single re-entry is permitted at the refined level.  
* **Scaling and Adding:** Scaling into a winning position is permitted only at secondary structural FVG formations, risking only half of the original risk parameter. The "No-Add-To-Loser" rule is absolute; averaging down into a losing position results in immediate suspension of the trading session.

### **Specific Scenario Playbooks**

* **Trade goes immediately in profit:** Execute the primary plan. Take 50% partials at 2R if the external target is distant. Trail stop behind newly formed protected lows/highs.  
* **Trade taps entry then consolidates heavily:** If price action remains stagnant for more than 5 candles (Low volume exit rule), manually close the position at market. The momentum is absent.  
* **Trade nearly hits SL then aggressively reverses:** Maintain the position. The original stop placement was structurally sound and survived the algorithmic stress test.  
* **Trade hits 1R then sharply rejects:** If the rejection causes an opposite-direction lower-timeframe MSS, exit immediately at market. Do not wait for breakeven or the stop loss.  
* **Trade sweeps liquidity against the position:** If a higher-timeframe liquidity pool is raided against the intended direction and price fails to displace, the macro bias was likely incorrect. Liquidate the position.

## **Confluence Model**

To maintain statistical superiority, setups are graded objectively through a scoring matrix prior to capital allocation. Emotional bias is replaced by numerical thresholds.

### **Confluence Matrix (Maximum 12 Points)**

| Confluence Variable | Point Value | Rationale |
| :---- | :---- | :---- |
| **HTF Bias Aligned** | \+2 | Daily and 4H directional convergence ensures the macro algorithm is providing a tailwind. (Most critical). |
| **Liquidity Swept** | \+2 | Clear SSL/BSL swept prior to setup creation guarantees counter-party liquidity was acquired. (Most critical). |
| **MSS \+ Displacement** | \+2 | Energetic structural shift leaving a distinct FVG confirms institutional footprint. |
| **Premium/Discount** | \+1 | Long executions exclusively in HTF discount; short executions exclusively in HTF premium. |
| **Clear Target** | \+1 | Opposing EQL/EQH or unmitigated session extremes provide a high-probability magnetic draw. |
| **Killzone Timing** | \+1 | Setup occurs strictly within the high-volume London or NY AM Killzones. |
| **News Filter Clear** | \+1 | No red folder events scheduled within a 2-hour operational radius. |
| **Clean Delivery** | \+1 | Smooth price action, lacking excessive bidirectional chop and massive wicks prior to entry. |
| **Logical Stop-Loss** | \+1 | Stop is logically protected by a structural sweep origin, incorporating the required Gold spread buffer. |

**Setup Classification and Execution Mapping:**

* **A+ Setup (9–12 points):** Maximum allowed risk applied (0.50%). Full conviction execution.  
* **A Setup (7–8 points):** Standard operational risk applied (0.25%).  
* **B Setup (5–6 points):** Setup is compromised. Reduced risk applied (0.10% \- 0.15%), or skipped entirely depending on daily drawdown limits.  
* **Below 5 points:** Categorically defined as 'No Trade'. The setup is abandoned.

## **Full Trading Checklists**

Checklists enforce process over outcome. They must be physically verified prior to interaction with the trading terminal.

### **Pre-Market Checklist**

* \[ \] What is the exact Daily and 4H macro directional bias?  
* \[ \] Where is the current price relative to the Daily and Weekly Open levels?  
* \[ \] Where is the current price relative to the Premium/Discount of the broader 4H dealing range?  
* \[ \] Have the Previous Day High/Low and Asian High/Low been mapped?  
* \[ \] Check ForexFactory. Are there any Red Folder news events scheduled today?  
* \[ \] What specific Killzone session are we currently operating within?  
* \[ \] Has the maximum risk for the day been calculated based on current account equity?

### **Setup Checklist**

* \[ \] Has a distinct, significant liquidity pool been obviously swept via a wick?  
* \[ \] Did an energetic displacement occur immediately following the sweep?  
* \[ \] Did a true Market Structure Shift (MSS/CHOCH) validate the reversal?  
* \[ \] Is there a clearly defined, unmitigated FVG, OB, or Breaker Block present?  
* \[ \] Is the entry POI mathematically located in the correct Premium/Discount zone?  
* \[ \] Is the target liquidity structurally clear and unobstructed?  
* \[ \] Does the setup yield an acceptable minimum Risk-Reward ratio of 1:2?  
* \[ \] Is the current bid/ask spread acceptable for execution (avoiding rollover hours)?

### **Entry Checklist**

* \[ \] Determine exact Entry Price for the limit order.  
* \[ \] Determine exact Stop-Loss Price, explicitly adding the 15-20 pip Gold spread buffer.  
* \[ \] Determine exact Take-Profit Price at structural liquidity.  
* \[ \] Calculate precise Position Size to ensure risk does not exceed the predefined 0.25%-0.50% threshold.  
* \[ \] Verify the execution complies with the prop-firm minimum holding time rules (no micro-scalping under 120 seconds).  
* \[ \] Capture a screenshot of the chart mapping the thesis *before* entry execution.

### **Management Checklist**

* \[ \] When to take partials: At 1:2R if the primary macro target is distantly extended.  
* \[ \] When to move SL: Only after a secondary structural break in the intended direction.  
* \[ \] When to close early: If price stalls in consolidation for 5+ candles or a sudden opposite MSS occurs.  
* \[ \] When to hold: Let the algorithm deliver price to the structural target; do not micromanage normal pullbacks.

### **Post-Trade Checklist**

* \[ \] Was the initial macro bias accurate?  
* \[ \] Was the liquidity matrix mapped correctly?  
* \[ \] Was the entry executed strictly according to the mechanical model rules?  
* \[ \] Was the stop-loss logical and properly buffered?  
* \[ \] Did I flawlessly follow the predetermined risk parameters?  
* \[ \] Was this mathematically an A+, A, B, or poor trade?  
* \[ \] Capture a screenshot of the chart *after* the exit. Log the lesson learned.

## **Backtesting Plan**

An algorithmic model requires exhaustive statistical verification through rigorous backtesting to neutralize hindsight bias and generate execution confidence.

### **System Verification Methodology**

* **Minimum Sample Size:** Statistical relevance requires a minimum of 100 executions per specific entry model.  
* **Scope of Testing:** XAUUSD data spanning the preceding 12 to 24 months, strictly filtered for London and NY AM killzones.  
* **Data Integrity:** A dedicated replay mode must be utilized to simulate live market conditions bar-by-bar, strictly masking future price action to prevent subconscious curve-fitting.  
* **Defining Validity:** A setup is only recorded as valid if it meets an 8+ score on the confluence matrix. "Almost" setups must be recorded as non-events to maintain data integrity.

### **Key Performance Metrics**

* **Win Rate:** Percentage of trades successfully achieving the primary target.  
* **Average RR:** The average risk-to-reward multiple per winning trade.  
* **Expectancy Formula:** ![][image3]. A positive expectancy is mandatory.  
* **Maximum Drawdown:** The largest peak-to-trough drop in simulated equity, critical for adjusting risk to survive prop-firm limits.  
* **Losing Streak:** The maximum sequential string of losses, used to calibrate daily stop-loss rules.  
* **Average Hold Time:** Ensures compliance with prop-firm minimum duration requirements.

### **Standardized Backtesting Template**

| Date/Time | Session | Asset | Setup Model | HTF Bias | Liquidity Swept | Confluence Score | Entry Price | Stop Loss | Target | Result (R) | Hold Time | Errors/Notes |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| \- | \- | XAUUSD | \- | \- | \- | \- | \- | \- | \- | \- | \- | \- |

## **Gold (XAUUSD) Specific Trading Rules**

Gold functions as a highly manipulated, fast-moving, liquidity-seeking asset governed by distinct macroeconomic drivers. Standard forex rules must be aggressively modified for XAUUSD.

* **Extreme Wick Behavior:** XAUUSD algorithms are notorious for executing aggressive, deep liquidity sweeps. A technical level that appears completely broken will frequently result in a violent 30 to 50-pip wick reversal within a single 1-minute candle. Consequently, traditional breakout trading is mathematically suicidal on gold. Entries must be exclusively limited to limit orders placed at extreme discounts/premiums following the sweep.  
* **Volatility Spikes and Spread:** During major fundamental news 14 and the 17:00 EST daily rollover 15, XAUUSD spreads can widen instantaneously from 10 points to over 150 points. Standard stop-losses will experience catastrophic slippage, blowing through risk limits. The absolute rule is maintaining flat exposure during these specific windows.  
* **Daily Range and ATR Behavior:** Gold typically expands 150 to 250 pips in a standard daily range. If the daily Average True Range (ATR) has already been heavily exhausted during an expansive London session, subsequent New York setups must dynamically target tighter internal liquidity points rather than anticipating continued, low-probability macro expansion.  
* **Chop Avoidance:** XAUUSD consolidations are erratic and wide. If the 15M chart does not present a clear directional draw on liquidity, entries inside the chop will result in multiple rapid stop-outs.  
* **The "One Good Trade" Protocol:** Gold provides immense, rapid RR opportunities due to its high volatility. Overtrading is the primary cause of account failure. Once a single successful execution yields 2R or greater, the trader is mandated to cease operations for the session. This directly preserves prop-firm consistency ratios and protects psychological capital.2

## **Example Full Playbooks**

### **Playbook A: Bullish Liquidity Sweep Reversal (London Judas)**

* **HTF Bias:** Daily is bullish; 4H is drawing aggressively toward an unmitigated previous weekly high.  
* **Liquidity Condition:** The Asian Session consolidates tightly. At exactly 02:30 EST (London Open), price drops violently to sweep the Asian Low (SSL).  
* **Entry Trigger:** The 5-minute chart exhibits an aggressive wick rejection below the Asian Low, immediately followed by a bullish MSS breaking the immediate internal high with displacement. A clear FVG is left behind. A buy limit is set at the FVG open.  
* **SL:** Placed exactly 20 pips below the absolute lowest wick of the Asian sweep to account for spread.  
* **TP:** The opposing Asian Session High (External BSL).  
* **Management:** Move SL to breakeven only once price successfully breaches the 50% equilibrium line of the total Asian range.  
* **Invalidation:** If the price completely fills the FVG with a candle body close prior to executing the pending order, the limit is deleted.

### **Playbook B: Bearish Liquidity Sweep Reversal (NY AM Setup)**

* **HTF Bias:** Daily is bearish; 4H is actively trading within a premium zone.  
* **Liquidity Condition:** The London Session High is aggressively swept at 08:30 EST (NY Open / immediately following minor data release).  
* **Entry Trigger:** The 1-minute chart forms a CHOCH, rapidly followed by a confirmed bearish MSS. A Bearish Order Block (the final up-candle before the break that caused the sweep) is validated. A sell limit is placed at the OB open.  
* **SL:** Placed 15 pips above the extreme wick of the London High sweep.  
* **TP:** The London Session Low (External SSL).  
* **Management:** 50% partials are secured at 2R. The remainder is held for the macro target at the London Low.  
* **Invalidation:** Price closes a full 1M candle body above the distal edge of the Order Block.

### **Playbook C: Bullish Continuation Pullback**

* **HTF Bias:** Strongly bullish, clear institutional order flow.  
* **Liquidity Condition:** Price creates a notable swing high during the NY AM session, then pulls back deliberately to sweep internal SSL (a manufactured inducement low).  
* **Entry Trigger:** Following the sweep, price taps perfectly into a 15M Bullish Breaker Block situated deeply within the discount of the day's total expansion range. A limit order is set at the top boundary of the Breaker.  
* **SL:** Placed tightly below the specific wick that tested the Breaker block.  
* **TP:** The newly formed NY high.  
* **Management:** Implement a manual trailing stop, moving it below new internal structural lows as the price rallies.

### **Playbook D: Bearish Continuation Pullback**

* **HTF Bias:** Strongly bearish trend.  
* **Liquidity Condition:** Price drops heavily, enters a minor retracement phase that engineers equal highs (EQH), then breaks lower again.  
* **Entry Trigger:** Price retraces upward to sweep the internal EQH trap, tapping into an unmitigated 5M FVG located in the premium of the specific retracement leg. A sell limit is placed at Consequent Encroachment (50% of the FVG).  
* **SL:** Placed above the origin high of the displacement leg that initially created the FVG.  
* **TP:** The established low of the day (LOD).  
* **Management:** If price slows and fails to displace downward within 15 minutes of entry, exit the position completely.

### **Playbook E: London Judas Gold Setup**

* **HTF Bias:** Neutral / Range-bound.  
* **Liquidity Condition:** Price slowly grinds upward toward a major, highly visible Previous Day High (PDH).  
* **Entry Trigger:** Price spikes above the PDH. No action is taken on the break. The precise moment the price drops back *below* the exact numerical level of the PDH, a market short is executed.  
* **SL:** Placed 15 pips above the newly created absolute high of the false breakout.  
* **TP:** The opposing Previous Day Low (PDL), utilizing the entire daily range.  
* **Management:** Extremely rapid execution is required. Standard risk must be halved (0.25%) due to the inherently counter-momentum nature of the execution.

### **Playbook F: New York PM Trend Alignment**

* **HTF Bias:** Bearish macro structure.  
* **Liquidity Condition:** Both London and NY AM have pushed lower. The lunch session (12:00-13:00 EST) consolidates, purposefully creating buy-side inducement.  
* **Entry Trigger:** At exactly 13:30 EST, price spikes upward to sweep the engineered lunch high and flawlessly mitigates an un-tested NY AM FVG. A sell limit is placed at the FVG open.  
* **SL:** Placed above the extreme of the lunch high sweep.  
* **TP:** The established NY AM low.  
* **Management:** The position must be entirely flattened by 16:00 EST, regardless of target proximity, to avoid entering the end-of-day illiquidity phase.

## **Common Mistakes and Systematic Fixes**

| Pervasive Mistake | Root Cause / Why it Happens | Danger to Capital | Systematic Fix & Prevention Rule |
| :---- | :---- | :---- | :---- |
| **Entering Before Liquidity Sweep** | Fear of Missing Out (FOMO) and impatience. | The algorithm will utilize the early entry as counter-party liquidity. | "If there is no obvious sweep, your position is the sweep." Mandate wick validation before limit placement. |
| **Marking Every Candle as an OB** | Fundamental misunderstanding of institutional order flow. | Leads to executing low-probability, random trades across the chart. | Only mark OBs that explicitly swept liquidity *and* directly caused an MSS. |
| **Confusing CHOCH with BOS** | Impatience and over-analyzing lower timeframes. | Entering major reversals directly against massive macro trends. | Align LTF CHOCH exclusively with HTF POIs. A CHOCH in the middle of a range is algorithmic noise. |
| **Trading the Middle of the Range** | Desire for action; boredom. | Equilibrium is the lowest probability zone, characterized by random chop. | Executions are strictly forbidden outside of the upper 25% Premium or lower 25% Discount extremes. |
| **Trading News Candles** | Gambling mentality; seeking lottery payouts. | Immediate prop firm violations (2-minute rule) and severe slippage destruction.6 | Remain absolutely flat 5 minutes before red folder events. Wait 15-30 minutes post-event to engage. |
| **Taking FVGs Without Displacement** | Mechanical blindness. | Trading regular price gaps rather than institutional footprints. | An FVG is only valid if created by massive, high-volume momentum. Ignore slow, creeping gaps. |
| **Ignoring XAU Spread/Rollover** | Lack of structural asset knowledge. | Arbitrary stop-outs despite a perfectly correct directional bias. | Unconditionally apply a 15-20 pip buffer. Absolutely zero holding exposure through 17:00 EST.15 |
| **Moving SL to BE Too Early** | Fear of loss; protecting ego rather than equity. | Getting mathematically tagged out by natural, required internal pullbacks. | Do not advance SL until a secondary external structural point is broken in the intended direction. |
| **Holding After Invalidation** | Hope overriding logic. | Massive drawdown accumulation. | If the structural sweep origin is breached, the trade is instantly dead. Market close out. |
| **Overtrading Lower Timeframes** | Dopamine addiction. | Commission drain and statistical ruin. | Execute only when HTF context aligns. The 1M chart is a trigger, not a map. |
| **Forcing Bias** | Imposing personal beliefs on the market. | Fighting the institutional algorithm. | Trade the chart, not the forecast. If structure shifts, the bias must shift immediately. |
| **Over-sizing to pass Prop Firm** | Greed and lack of business plan. | Violating the strict 30% consistency rule, leading to payout denial.2 | Utilize fixed risk exclusively (0.25%-0.50%). A maximum 1R variation between operational days. |

## **Final Documentation and Templates**

### **One-Page SMC Execution Plan**

**Phase 1: Pre-Market Protocol (07:00 EST)**

1. Macro Check: Establish Daily/4H Draw on Liquidity.  
2. Range Check: Is current price in Premium or Discount?  
3. Liquidity Map: Highlight PDH/PDL, Asian High/Low.  
4. News Filter: Note all Red Folder times. Establish 5-minute blackout zones prior to the event.

**Phase 2: Setup Validation (Killzones Only)**

1. Identify a distinct Liquidity Sweep (BSL or SSL via wick).  
2. Confirm a high-energy Market Structure Shift (MSS) leaving a valid FVG.  
3. Validate Confluences. Score must equal or exceed 8 points.

**Phase 3: Mechanical Execution**

1. Set Limit Order exactly at the POI (FVG/OB).  
2. Set Stop-Loss with the mandatory XAUUSD 15-pip structural buffer.  
3. Verify risk equals 0.25% \- 0.50%. Calculate exact lot size.  
4. Confirm target RR is ![][image4] 1:2.

**Phase 4: Active Management**

1. Ensure trade hold time exceeds 120 seconds for prop firm compliance.  
2. Move SL to breakeven *only* after a secondary BOS.  
3. Close at predetermined structural target. No manual interference based on emotion.

### **Daily Trading Plan Template**

* **Date:**  
* **Primary Asset:** XAUUSD  
* **Daily Bias:**  
* **Key Target Liquidity Pool:**  
* **Key Entry POI:**  
* **Red Folder News Times:**  
* **Max Daily Loss Limit:** \[-2.0%\]  
* **Operational Killzone:**

### **Trade Journal Template**

* **Execution Time & Date:**  
* **Setup Type:**  
* **Confluence Score:** \[ / 12\]  
* **Risk Applied:** \[ %\]  
* **Entry Price:**  
* **Stop-Loss Price (with buffer):**  
* **Take-Profit Price:**  
* **Result in R:**  
* **Hold Time:** \[Minutes\]  
* **Did I follow all mechanical rules perfectly?**  
* **Screenshot Link Before:**  
* **Screenshot Link After:**

### **Prop-Firm Compliance Checklist**

* \[ \] Daily Drawdown limit is intact (Max \-2%).  
* \[ \] No executions occurred within 2 minutes of Red Folder news events.7  
* \[ \] All profitable executions were held for a minimum of 120 seconds.6  
* \[ \] Maximum lot size variance is within standard parameters.  
* \[ \] Current highest single-day profit does not exceed 30% of total accumulated profit.2  
* \[ \] Zero positions were held over the weekend or through the daily rollover.15

#### **Works cited**

1. Instant Funding Prop Firm Rules Every Trader Must Obey, accessed June 13, 2026, [https://www.goatfundedtrader.com/blog/instant-funding-prop-firm-rules](https://www.goatfundedtrader.com/blog/instant-funding-prop-firm-rules)  
2. What Is the Consistency Rule in Prop Firms? Complete Guide \+ Calculator 2026, accessed June 13, 2026, [https://phidiaspropfirm.com/education/consistency-rule](https://phidiaspropfirm.com/education/consistency-rule)  
3. How Do You Calculate Consistency Rule? \- TradingFunds \- Funded Trading Accounts for Forex Traders, accessed June 13, 2026, [https://tradingfunds.com/how-do-you-calculate-consistency-rule/](https://tradingfunds.com/how-do-you-calculate-consistency-rule/)  
4. Prop Firm Consistency Rule Definition, Types and Examples, accessed June 13, 2026, [https://propfirmapp.com/learn/consistency-rule](https://propfirmapp.com/learn/consistency-rule)  
5. Navigating the Consistency Rule in Prop Trading Firms: A Comprehensive Guide | YourPropFirm, accessed June 13, 2026, [https://yourpropfirm.com/consistency-rule-prop-firm/](https://yourpropfirm.com/consistency-rule-prop-firm/)  
6. Prop Firm Rules Explained | Trade Smart with Prop Firm Match, accessed June 13, 2026, [https://propfirmmatch.com/prop-firm-rules](https://propfirmmatch.com/prop-firm-rules)  
7. Futures Prop Firm Rules Explained | Trade Smart with Prop Firm Match, accessed June 13, 2026, [https://propfirmmatch.com/futures/prop-firm-rules](https://propfirmmatch.com/futures/prop-firm-rules)  
8. The 90-Min Gold Windows Retail Traders Sleep Through | FXNX, accessed June 13, 2026, [https://fxnx.com/en/blog/ict-killzones-master-xauusd-timing-maximum-profit](https://fxnx.com/en/blog/ict-killzones-master-xauusd-timing-maximum-profit)  
9. ICT Killzones Explained: Times, Sessions & Trading Strategy | LiteFinance, accessed June 13, 2026, [https://www.litefinance.org/blog/for-beginners/trading-strategies/ict-killzones/](https://www.litefinance.org/blog/for-beginners/trading-strategies/ict-killzones/)  
10. Gold (XAUUSD) Trading Hours: Best Time to Trade Gold \- TMGM, accessed June 13, 2026, [https://www.tmgm.com/en/academy/trading-academy/gold-trading-hours](https://www.tmgm.com/en/academy/trading-academy/gold-trading-hours)  
11. ICT Killzones (2026): The Only Times to Trade ICT Concepts \- TradingRage, accessed June 13, 2026, [https://tradingrage.com/learn/ict-killzone-explained](https://tradingrage.com/learn/ict-killzone-explained)  
12. Best Times to Trade Gold & Silver (XAUUSD/XAGUSD) | 2026 \- Anzo Capital, accessed June 13, 2026, [https://www.anzocapital.com/en/blog/best-time-to-trade-gold-silver](https://www.anzocapital.com/en/blog/best-time-to-trade-gold-silver)  
13. Best XAUUSD Trading Hours: When I Trade Gold for Maximum Moves | by William Grey, accessed June 13, 2026, [https://medium.com/@williamgrey/best-xauusd-trading-hours-when-i-trade-gold-for-maximum-moves-5a99d7a88754](https://medium.com/@williamgrey/best-xauusd-trading-hours-when-i-trade-gold-for-maximum-moves-5a99d7a88754)  
14. Best Time to Trade Gold (XAUUSD): Sessions, Volatility and News \- NordFX, accessed June 13, 2026, [https://nordfx.com/traders-guide/best-time-to-trade-gold-xauusd-sessions-volatility-news](https://nordfx.com/traders-guide/best-time-to-trade-gold-xauusd-sessions-volatility-news)  
15. XAUUSD Trading Hours: Weekly Schedule, Sessions & Rollover Times \- STARTRADER, accessed June 13, 2026, [https://www.startrader.com/knowledge-intermediate/xauusd-trading-hours-open-close-best-times-to-trade-gold/](https://www.startrader.com/knowledge-intermediate/xauusd-trading-hours-open-close-best-times-to-trade-gold/)  
16. Trading Times | Forex Market Hours | OANDA Global Markets, accessed June 13, 2026, [https://www.oanda.com/bvi-en/cfds/hours-of-operation/](https://www.oanda.com/bvi-en/cfds/hours-of-operation/)  
17. Alpha Capital News Trading and Overnight Rules Explained (2026), accessed June 13, 2026, [https://alphacapitalgroup.uk/posts/alpha-capital-news-trading-and-overnight-rules-explained-2026](https://alphacapitalgroup.uk/posts/alpha-capital-news-trading-and-overnight-rules-explained-2026)  
18. FAQ | Maven Trading Questions Answered, accessed June 13, 2026, [https://maventrading.com/faqs](https://maventrading.com/faqs)  
19. Trading Rules for FunderPro, accessed June 13, 2026, [https://funderpro.com/trading-rules/](https://funderpro.com/trading-rules/)

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,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>

[image3]: <data:image/png;base64,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>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAYCAYAAADzoH0MAAAAiUlEQVR4XmNgGAVUA65A/B+Is9AlSAXWDBCDutElSAWqQPwTiJehS5AKRID4PRAfQpcgFXAA8X0gvgbEzGhyRAMxIP4AxDvQJQgBdSD+BcQL0SUIATsGSIy0oUsQApEMZKaJXAaIRj90CWJAAxAboQsOLSANxN5EYguoHhQASrLmRGJNqJ5RAAUAHygX0mC2yfQAAAAASUVORK5CYII=>