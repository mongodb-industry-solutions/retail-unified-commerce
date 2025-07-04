export default async function createEmbedding(query) {
    // Replace with VOYAGE AI embeddings
    
    // const url = process.env.EMBEDDING_ENDPOINT;
    // const body = JSON.stringify({
    //     'text': [query]    
    // });
    // let response = await fetch(
    //     url, 
    //     {
    //         body,
    //         method: "POST",
    //         headers: {
    //             "Content-Type": "application/json",
    //         },
    //     }
    // );
    // try {
    //     response = await response.json();
    // } catch (error) {
    //     console.error(error);
    //     throw new Error("Parsing embeddings failed.");
    // }

    // if (response.error) {
    //     console.error(response.error);
    //     throw new Error("Generating embeddings failed.");
    // }
    // //console.log("RESPONSE VECTOR SIZE, ", response.vectors[0].length)

    // return response?.vectors[0] || [];
};
