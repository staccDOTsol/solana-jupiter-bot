const { calculateProfit, toDecimal, storeItInTempAsJSON } = require("../utils");
const cache = require("./cache");
const {createTransferInstruction } = require ('../../spl-token')
const { getSwapResultFromSolscanParser } = require("../services/solscan");
const { sendAndConfirmTransaction, Transaction, PublicKey } = require("@solana/web3.js");
const helpers = require('../../node_modules/@prism-hq/prism-ag/dist/swap/helpers')
const swap = async (prism, route, tokenA) => {
	try {
		const performanceOfTxStart = performance.now();
		cache.performanceOfTxStart = performanceOfTxStart;
 
		//if (process.env.DEBUG) storeItInTempAsJSON("routeInfoBeforeSwap", route);
		const { user, publicKey, connection, settings } = prism;
        let { preTransaction, preSigners, mainTransaction, postTransaction, toFees, midFees, fromTokenAccount, midTokenAccount, toTokenAccount, mainSigners, } = await prism.generateSwapTransactions(route);
        let transactions = [preTransaction, mainTransaction, postTransaction];
		let me = (await connection.getParsedTokenAccountsByOwner(user.publicKey, {
			mint: new PublicKey(tokenA.address),
		})
	).value[0]
		transactions.push(new Transaction().add(createTransferInstruction(me.pubkey, 
		me.pubkey, 
		publicKey, 
		
			me.account.data.parsed.info.tokenAmount.amount ) ))
			let serialized = [];
			let blockhash =  (await connection.getLatestBlockhash()).blockhash 
			for (var t of transactions){
				if (t.instructions){
				t.recentBlockhash =blockhash
				t.feePayer = publicKey
				user.signTransaction(t);
				serialized.push(t.serialize());
				}
			}
       
        for (let i = 0; i < serialized.length; i++) {
            const { signature, response } = await sendAndConfirmTransaction (connection, serialized[i], {skipPreflight: false});
		}
		//if (process.env.DEBUG) storeItInTempAsJSON("result", result);

		const performanceOfTx = performance.now() - performanceOfTxStart;
		return
		return [result, performanceOfTx];
	} catch (error) {
		console.log("Swap error: ", error);
	}
};
exports.swap = swap;

const failedSwapHandler = (tradeEntry) => {
	// update counter
	cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].fail++;

	// update trade history
	cache.config.storeFailedTxInHistory;

	// update trade history
	let tempHistory = cache.tradeHistory;
	tempHistory.push(tradeEntry);
	cache.tradeHistory = tempHistory;
};
exports.failedSwapHandler = failedSwapHandler;

const successSwapHandler = async (tx, tradeEntry, tokenA, tokenB) => {
	if (process.env.DEBUG) storeItInTempAsJSON(`txResultFromSDK_${tx?.txId}`, tx);

	// update counter
	cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].success++;

	if (cache.config.tradingStrategy === "pingpong") {
		// update balance
		if (cache.sideBuy) {
			cache.lastBalance.tokenA = cache.currentBalance.tokenA;
			cache.currentBalance.tokenA = 0;
			cache.currentBalance.tokenB = tx.response?.toAmount ;
		} else {
			cache.lastBalance.tokenB = cache.currentBalance.tokenB;
			cache.currentBalance.tokenB = 0;
			cache.currentBalance.tokenA = tx.response?.toAmount;
		}

		// update profit
		if (cache.sideBuy) {
			cache.currentProfit.tokenA = 0;
			cache.currentProfit.tokenB = calculateProfit(
				cache.initialBalance.tokenB,
				cache.currentBalance.tokenB
			);
		} else {
			cache.currentProfit.tokenB = 0;
			cache.currentProfit.tokenA = calculateProfit(
				cache.initialBalance.tokenA,
				cache.currentBalance.tokenA
			);
		}

		// update trade history
		let tempHistory = cache.tradeHistory;


		tradeEntry.profit = calculateProfit(
			cache.lastBalance[cache.sideBuy ? "tokenB" : "tokenA"],
			tx.response?.toAmount
		);
		tempHistory.push(tradeEntry);
		cache.tradeHistory = tempHistory;
	}
	if (cache.config.tradingStrategy === "arbitrage") {
		/** check real amounts on solscan because Jupiter SDK returns wrong amounts
		 *  when we trading TokenA <> TokenA (arbitrage)
		 */
		try {
		var [inAmountFromSolscanParser, outAmountFromSolscanParser] =
		await getSwapResultFromSolscanParser(tx?.txId);
		
		if (outAmountFromSolscanParser /10 ** tokenA.decimals <= 0) {
			tradeEntry.outAmount = tradeEntry.inAmount

			cache.tradeCounter[cache.sideBuy ? "buy" : "sell"].success--;
			
		// update trade history
		
			return 1

		} else{
			console.log('')
			console.log(tradeEntry.inAmount)
			tradeEntry.outAmount = (outAmountFromSolscanParser /10 ** tokenA.decimals).toString()
			console.log(outAmountFromSolscanParser)
		inAmountFromSolscanParser = tradeEntry.inAmount;
		cache.lastBalance.tokenA = cache.currentBalance.tokenA;
		cache.currentBalance.tokenA =
			cache.lastBalance.tokenA +outAmountFromSolscanParser   / 10 ** tokenA.decimals

		// update trade history
		let tempHistory = cache.tradeHistory;


		tradeEntry.profit = calculateProfit(
			tradeEntry.inAmount,
			outAmountFromSolscanParser
		);
		tempHistory.push(tradeEntry);
		cache.tradeHistory = tempHistory;

		const prevProfit = cache.currentProfit.tokenA;

		// total profit
		cache.currentProfit.tokenA = prevProfit + tradeEntry.profit;
			return 1
		}
	} catch (err){
		return 1
	}
	}
	return 1
};
exports.successSwapHandler = successSwapHandler;
