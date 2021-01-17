
import { Utils } from "@arkecosystem/core-kernel";


export let BigIntToString = (bigint: Utils.BigNumber, approx: number, decimals: number = 8) => {
    let string = bigint.toString();
    if (string.length < decimals + 1 ) string = '0'.repeat(decimals + 1 - string.length) + string;
    if (approx > 0) return [string.slice(0, -decimals), ".", string.slice(-decimals, -(decimals-Math.min(approx, decimals)))].join("");
    else return string.slice(0, -decimals);
}