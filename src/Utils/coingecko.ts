
export let coingecko_request = async (ticker: string | undefined) => {
    if (ticker === undefined) return undefined;
    try{
        const request = await fetch (`https://api.coingecko.com/api/v3/coins/${ticker}`);
        const json = await request.json();
        return json;
    }catch (e){
        return undefined;
    }
 }

