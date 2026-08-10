const fetch = require("node-fetch");
fetch("https://xoso.com.vn/xsmb-28-01-2024.html")
                .then(async (response) => {
                    const data = await response.text();
                    console.log(data)
                    return { statusCode: response.status, body: data };
                })
                .then((response) => {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        return res.send(response.body);
                    } else {
                      return res.send(response.body);
                    }
                })