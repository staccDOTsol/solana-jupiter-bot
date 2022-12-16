console.clear();

require("dotenv").config();
const { clearInterval } = require("timers");
const { PublicKey } = require("@solana/web3.js");

const {
	calculateProfit,
	toDecimal,
	toNumber,
	updateIterationsPerMin,
	checkRoutesResponse,
} = require("../utils");
const { handleExit, logExit } = require("./exit");
const cache = require("./cache");
const { setup, getInitialOutAmountWithSlippage } = require("./setup");
const { printToConsole } = require("./ui/");
const { swap, failedSwapHandler, successSwapHandler } = require("./swap");
let mod = 1
const pingpongStrategy = async (prism, tokenA, tokenB) => {
	cache.iteration++;
	const date = new Date();
	const i = cache.iteration;
	cache.queue[i] = -1;

	try {
		// calculate & update iterations per minute
		updateIterationsPerMin(cache);

		// Calculate amount that will be used for trade
		let amountToTrade =
			cache.config.tradeSize.strategy === "cumulative"
				? cache.currentBalance[cache.sideBuy ? "tokenA" : "tokenB"]
				: cache.initialBalance[cache.sideBuy ? "tokenA" : "tokenB"];
		amountToTrade = amountToTrade * mod
		const baseAmount = cache.lastBalance[cache.sideBuy ? "tokenB" : "tokenA"];

		// default slippage
		const slippage =
			typeof cache.config.slippage === "number" ? cache.config.slippage : 1;

		// set input / output token
		const inputToken = cache.sideBuy ? tokenA : tokenB;
		const outputToken = cache.sideBuy ? tokenB : tokenA;

		// check current routes
		const performanceOfRouteCompStart = performance.now();
		await prism.loadRoutes(tokenA.address, tokenA.address);

		const routes = prism.getRoutes(amountToTrade / 10 ** tokenA.decimals);
		
		
		// count available routes
		cache.availableRoutes[cache.sideBuy ? "buy" : "sell"] =
			routes.length;

		// update status as OK
		cache.queue[i] = 0;

		const performanceOfRouteComp =
			performance.now() - performanceOfRouteCompStart;

		// choose first route
		const route = routes[Math.floor(Math.random() * 3) + 0];
		//checkRoutesResponse(routes);
		if (!route) return 


		// update slippage with "profit or kill" slippage
		if (cache.config.slippage === "profitOrKill") {
			route.amountOut =
				cache.lastBalance[cache.sideBuy ? "tokenB" : "tokenA"];
		}

		// calculate profitability

		const simulatedProfit = calculateProfit(baseAmount, await route.amountOut);

		// store max profit spotted
		if (
			simulatedProfit > cache.maxProfitSpotted[cache.sideBuy ? "buy" : "sell"]
		) {
			cache.maxProfitSpotted[cache.sideBuy ? "buy" : "sell"] = simulatedProfit;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB,
			route,
			simulatedProfit,
		});

		// check profitability and execute tx
		let tx, performanceOfTx;
		if (
			!cache.swappingRightNow &&
			(cache.hotkeys.e ||
				cache.hotkeys.r ||
				simulatedProfit >= parseFloat(cache.config.minPercProfit))
		) {

			if (cache.tradingEnabled || cache.hotkeys.r) {
				cache.swappingRightNow = false //true;
				// store trade to the history
				let tradeEntry = {
					date: date.toLocaleString(),
					buy: cache.sideBuy,
					inputToken: inputToken.symbol,
					outputToken: outputToken.symbol,
					amountIn: toDecimal(route.amountIn * 10 ** tokenA.decimals, inputToken.decimals),
					expectedOutAmount: toDecimal (route.amountOut * 10 ** tokenA.decimals, outputToken.decimals),
					expectedProfit: simulatedProfit,
				};

				// start refreshing status
				const printTxStatus = setInterval(() => {
					if (cache.swappingRightNow) {
						printToConsole({
							date,
							i,
							performanceOfRouteComp,
							inputToken,
							outputToken,
							tokenA,
							tokenB,
							route,
							simulatedProfit,
						});
					}
				}, 500);

				[tx, performanceOfTx] = await swap(jupiter, route);

				// stop refreshing status
				clearInterval(printTxStatus);

				const profit = calculateProfit(
					cache.currentBalance[cache.sideBuy ? "tokenB" : "tokenA"],
					tx.response.toAmount 
				);

				tradeEntry = {
					...tradeEntry,
					amountOut: tx.response.toAmount  || 0,
					profit,
					performanceOfTx,
					error: tx.error?.message || null,
				};

				// handle TX results
				if (tx.error) failedSwapHandler(tradeEntry);
				else {
				
				mod = mod *	await successSwapHandler(tx, tradeEntry, tokenA, token);
				}
			}
		}

		if (tx) {
			if (!tx.error) {
				// change side
				cache.sideBuy = !cache.sideBuy;
			}
			cache.swappingRightNow = false;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB,
			route,
			simulatedProfit,
		});
	} catch (error) {
		cache.queue[i] = 1;
		console.log(error);
	} finally {
		delete cache.queue[i];
	}
};

const arbitrageStrategy = async (prism, tokenA) => {
	cache.iteration++;
	const date = new Date();
	const i = cache.iteration;
	cache.queue[i] = -1;
	try {
		// calculate & update iterations per minute
		updateIterationsPerMin(cache);

		// Calculate amount that will be used for trade
		let amountToTrade =
			cache.config.tradeSize.strategy === "cumulative"
				? cache.currentBalance["tokenA"]
				: cache.initialBalance["tokenA"];
		amountToTrade = amountToTrade * mod
		const baseAmount = amountToTrade;

		// default slippage
		const slippage =
			typeof cache.config.slippage === "number" ? cache.config.slippage : 1;
		// set input / output token
		const inputToken = tokenA;
		const outputToken = tokenA;

		// check current routes
		const performanceOfRouteCompStart = performance.now();
		await prism.loadRoutes(tokenA.address, tokenA.address);

		const routes = prism.getRoutes(amountToTrade / 10 ** tokenA.decimals);
		
		
		// count available routes
		cache.availableRoutes[cache.sideBuy ? "buy" : "sell"] =
			routes.length;

		// update status as OK
		cache.queue[i] = 0;

		const performanceOfRouteComp =
			performance.now() - performanceOfRouteCompStart;

		// choose first route
		const route = routes[Math.floor(Math.random() * 3) + 0];
		//checkRoutesResponse(routes);
		if (!route) return 
		// update slippage with "profit or kill" slippage
		if (cache.config.slippage === "profitOrKill") {
			route.amountOut = amountToTrade;
		}

		// calculate profitability
		
		const simulatedProfit = calculateProfit(route.amountIn,  route.amountOut);
		console.log(simulatedProfit)
		// store max profit spotted
		if (simulatedProfit > cache.maxProfitSpotted["buy"]) {
			cache.maxProfitSpotted["buy"] = simulatedProfit;
		}
		prism.setSlippage(Math.round(1/mod)+4);
		cache.config.slippage = Math.round(1/mod)+4;
		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB: tokenA,
			route,
			simulatedProfit,
		});

		// check profitability and execute tx
		let tx, performanceOfTx;
		if (
		
				simulatedProfit >= cache.config.minPercProfit
		) {
			// hotkeys
			

			if (true) {
				cache.swappingRightNow = false //true;
				// store trade to the history
				let tradeEntry = {
					date: date.toLocaleString(),
					buy: cache.sideBuy,
					inputToken: inputToken.symbol,
					outputToken: outputToken.symbol,
					amountIn: toDecimal(route.amountIn * 10 ** tokenA.decimals, inputToken.decimals),
					expectedOutAmount: toDecimal(route.amountOut * 10 ** tokenA.decimals, outputToken.decimals),
					expectedProfit: simulatedProfit,
				};

				// start refreshing status
				const printTxStatus = setInterval(() => {
					if (cache.swappingRightNow) {
						printToConsole({
							date,
							i,
							performanceOfRouteComp,
							inputToken,
							outputToken,
							tokenA,
							tokenB: tokenA,
							route,
							simulatedProfit,
						});
					}
				}, 500);

				[tx, performanceOfTx] = await swap(prism, route, tokenA);

				// stop refreshing status
				clearInterval(printTxStatus);
				if (false){
				const profit = calculateProfit(tradeEntry.amountIn, tx.response?.toAmount);

				tradeEntry = {
					...tradeEntry,
					amountOut: tx.response?.toAmount|| 0,
					profit,
					performanceOfTx,
					error: tx.error?.message || null,
				};

				// handle TX results
				if (tx.error) failedSwapHandler(tradeEntry);
				else {
					if (cache.hotkeys.r) {
						console.log("[R] - REVERT BACK SWAP - SUCCESS!");
						cache.tradingEnabled = true;
						console.log("TRADING DISABLED!");
						cache.hotkeys.r = false;
					}
					mod = mod * await successSwapHandler(tx, tradeEntry, tokenA, tokenA);
				}
			}
			}
		}

		if (tx) {
			cache.swappingRightNow = false;
		}

		printToConsole({
			date,
			i,
			performanceOfRouteComp,
			inputToken,
			outputToken,
			tokenA,
			tokenB: tokenA,
			route,
			simulatedProfit,
		});
	} catch (error) {
		cache.queue[i] = 1;
		
	} finally {
		delete cache.queue[i];
	}
};

const watcher = async (prism, tokenA, tokenB) => {
	if (
		!cache.swappingRightNow &&
		Object.keys(cache.queue).length < cache.queueThrottle
	) {
		if (cache.config.tradingStrategy === "pingpong") {
			await pingpongStrategy(prism, tokenA, tokenB);
		}
		if (cache.config.tradingStrategy === "arbitrage") {
			await arbitrageStrategy(prism, tokenA);
		}
	}
};

const run = async () => {
	try {
		// set everything up
		const { prism, tokenA, tokenB } = await setup();

		if (cache.config.tradingStrategy === "pingpong") {
			// set initial & current & last balance for tokenA
			cache.initialBalance.tokenA = toNumber(
				cache.config.tradeSize.value,
				tokenA.decimals
			);
			cache.currentBalance.tokenA = cache.initialBalance.tokenA;
			cache.lastBalance.tokenA = cache.initialBalance.tokenA;

			// set initial & last balance for tokenB
			cache.initialBalance.tokenB = await getInitialOutAmount(
				prism,
				tokenA,
				tokenB,
				cache.initialBalance.tokenA
			);
			cache.lastBalance.tokenB = cache.initialBalance.tokenB;
		} else if (cache.config.tradingStrategy === "arbitrage") {
			// set initial & current & last balance for tokenA
			cache.initialBalance.tokenA = toNumber(
				cache.config.tradeSize.value,
				tokenA.decimals
			);
			cache.currentBalance.tokenA = cache.initialBalance.tokenA;
			cache.lastBalance.tokenA = cache.initialBalance.tokenA;
		}

		global.botInterval = setInterval(
			() => watcher(prism, tokenA, tokenB),
			cache.config.minInterval
		);
	} catch (error) {
		logExit(error);
		process.exitCode = 1;
	}
};

run();

// handle exit
process.on("exit", handleExit);
