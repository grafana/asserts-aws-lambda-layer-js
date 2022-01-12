exports.handler = async (event, context) => {
    console.log("Actual handler method got invoked!!");
    const response = {
        statusCode: 200,
        event: JSON.stringify('Hello from Test Lambda Handler!'),
    };
    // error = false;
    // let end = Date.now();
    // latency.observe({}, (end - start)/1000);
    return response;
};