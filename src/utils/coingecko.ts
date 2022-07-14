import * as fetch from "node-fetch";

export const coingecko_request = async (ticker: string | undefined) => {
    if (ticker === undefined) return undefined;
    try {
        const request = await fetch(`https://api.coingecko.com/api/v3/coins/${ticker}`);
        if (!request.ok) {
            return undefined;
        }
        const json = await request.json();
        return json;
    } catch (e) {
        console.log(e);
        return undefined;
    }
};
