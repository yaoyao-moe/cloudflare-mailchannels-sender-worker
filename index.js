addEventListener("fetch", event => {
    event.respondWith(handleRequest(event.request))
});

async function handleRequest(request) {
    const url = new URL(request.url);
    const useENV = globalThis['USE_ENV'] === "true";

    if (request.method !== "POST" && request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/") {
        return new Response("I'm a teapot", { status: 418 });
    }

    if (/^\/api($|\/)/i.test(url.pathname)) {
        if (request.method !== "POST") {
            return new Response("This endpoint accepts POST requests only.", { status: 400 });
        }

        const authHeader = request.headers.get("Authorization");

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response("API key is required in the Authorization header with Bearer token format.", { status: 400 });
        }

        const apiKey = authHeader.slice(7);

        if (!apiKey) {
            return new Response("API key is required.", { status: 400 });
        }
        
        let storedDomain = null;

        if (useENV) {
            const validationResult = await checkAPIKeyENV(apiKey);
            if (!validationResult) {
                return new Response("Invalid API key.", { status: 401 });
            }
        } else {
            storedDomain = await checkAPIKeyKV(apiKey);
            if (!storedDomain) {
                return new Response("Invalid API key.", { status: 401 });
            }
        }

        if (url.pathname === "/api/v1/sendmail") {
            return handleSendMail(request);
        }

        return new Response("Not found", { status: 404 });
    }

    return new Response("Not found", { status: 404 });
}


async function checkAPIKeyENV(apiKey) {

    const validApiKeys = [];
    let i = 1;

    while (true) {
        const keyName = `API_KEY_${i}`;
        const apiKey = globalThis[keyName];

        if (!apiKey) {
            break;
        }

        const disabledKeyName = `API_KEY_${i}_DISABLED`;
        const isDisabled = globalThis[disabledKeyName] === "true";

        if (apiKey !== "DELETED" && !isDisabled) {
            validApiKeys.push(apiKey);
        }

        i++;
    }

    if (!validApiKeys.includes(apiKey)) {
        return false;
    }

    return true;

}

async function checkAPIKeyKV(apiKey) {
    const storedDomain = await API_KEYS.get(apiKey);

    if (!storedDomain || storedDomain === "disabled") {
        return null;
    }

    return storedDomain;
}

async function handleSendMail(request) {
    const formData = await request.formData();

    const fromEmail = formData.get("from_email");
    const fromName = formData.get("from_name");
    const fromDomain = fromEmail.split('@')[1];
    const fromDomainEnv = fromDomain.replace(/\./g, '_').toUpperCase();
    const dkimCheck = globalThis['DKIM_CHECK'] === "true";
    const dkimPrivateKeyName = `DKIM_PRIVATE_KEY_${fromDomainEnv}`;
    const dkimPrivateKey = globalThis[dkimPrivateKeyName]|| "";
    const dkimSelectorName = `DKIM_SELECTOR_${fromDomainEnv}`;
    const dkimSelector = globalThis[dkimSelectorName]|| "";

    const toEmail = formData.get("to_email");
    const toName = formData.get("to_name");
    const subject = formData.get("subject");
    const content = formData.get("content");
    const isHtml = formData.get("is_html") === "true";

    if (dkimCheck && (!dkimPrivateKey || !dkimSelector)) {
        const errorMessage = "DKIM settings are missing for the domain: " + fromDomain;
        return new Response(errorMessage, { status: 400 });
    }

  
    if (!fromEmail || !fromName || !toEmail || !toName || !subject || !content) {
        return new Response("All parameters are required.", { status: 400 });
    }

    function createPersonalization() {
        const basePersonalization = {
            "to": [
                {
                    "email": toEmail,
                    "name": toName
                }
            ]
        };

        if (dkimCheck) {
            return {
                ...basePersonalization,
                "dkim_domain": fromDomain,
                "dkim_selector": dkimSelector,
                "dkim_private_key": dkimPrivateKey
            };
        } else {
            return basePersonalization;
        }
    }

    function htmlToText(html) {
        const htmlWithLineBreaks = html.replace(/<\/(h\d|p|td|tr|div)>|<(br)[^>]*>/gi, '\n');
        const withoutStyleAndScript = htmlWithLineBreaks.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '');
        const withoutTags = withoutStyleAndScript.replace(/<\/?[^>]+(>|$)/g, "");

        let prevText = withoutTags;
        let newText = removeExtraSpacesAndLines(prevText);

        while (prevText !== newText) {
            prevText = newText;
            newText = removeExtraSpacesAndLines(prevText);
        }

        return newText;
    }

    function removeExtraSpacesAndLines(text) {
        const withoutExtraSpaces = text.replace(/\s{2,}/g, ' ');
        const withoutExtraLines = withoutExtraSpaces.replace(/\n{2,}/g, '\n');
        return withoutExtraLines;
    }

    const contentArray = [
        {
            "type": "text/plain; charset=utf-8",
            "value": isHtml ? htmlToText(content) : content,
        }
    ];

    if (isHtml) {
        contentArray.push({
            "type": "text/html; charset=utf-8",
            "value": content,
        });
    }
    const send_request = new Request("https://api.mailchannels.net/tx/v1/send", {
        "method": "POST",
        "headers": {
            "content-type": "application/json"
        },
        "body": JSON.stringify({
            "personalizations": [
                createPersonalization()
            ],
            "from": {
                "email": fromEmail,
                "name": fromName,
            },
            "subject": subject,
            "content": contentArray,
        }),
    });

    const resp = await fetch(send_request);
    const respJson = await resp.json();
    const responseStatus = resp.status;
    return new Response(JSON.stringify({ status: responseStatus, response: respJson}), {
        headers: { "content-type": "application/json" },
    });
}
