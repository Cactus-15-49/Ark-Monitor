
import { Utils } from "@arkecosystem/core-kernel";


export const BigIntToString = (bigint: Utils.BigNumber | number, approx: number, decimals: number = 8) => {
    let string = bigint.toString();
    if (string.length < decimals + 1 ) string = '0'.repeat(decimals + 1 - string.length) + string;
    if (approx > 0) return [string.slice(0, -decimals), ".", string.slice(-decimals, -(decimals-Math.min(approx, decimals)))].join("");
    else return string.slice(0, -decimals);
}

export const BigIntToBString = (bigint: Utils.BigNumber | number, approx: number, decimals: number = 8) => {
    let string = BigIntToString(bigint, approx, decimals);
    let p = string.indexOf('.');
    if (p == -1) p = string.length;
    for (let i = p - 4; i >= 0; i = i - 3) string = string.slice(0, i + 1) + "," + string.slice(i + 1);
    return string;
}