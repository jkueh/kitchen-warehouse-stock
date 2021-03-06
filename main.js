const puppeteer = require('puppeteer');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));

const debug = process.env.DEBUG?.toLowerCase().trim() == 'true';

var githubRefName = process.env.GITHUB_REF_NAME;
var githubJobId = process.env.GITHUB_JOB;

const productURL = process.env.PRODUCT_URL;
const discordWebhookURL = process.env.DISCORD_WEBHOOK_URL;

const { Webhook } = require('simple-discord-webhooks');

// https://github.com/apify/fingerprint-injector#usage-with-the-puppeteer
const FingerprintGenerator = require('fingerprint-generator');
const { FingerprintInjector } = require('fingerprint-injector');

var exitWithError = false;
if (!productURL) {
  console.error("PRODUCT_URL not set");
  exitWithError = true;
}

if (exitWithError) {
  process.exit(1);
}

(async () => {
  const fingerprintInjector = new FingerprintInjector();

  const fingerprintGenerator = new FingerprintGenerator({
    devices: ['desktop'],
    browsers: [{ name: 'chrome', minVersion: 88 }],
  });

  const { fingerprint } = fingerprintGenerator.getFingerprint();
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    executablePath: path.resolve("/usr/bin/google-chrome"),
    headless: true,
  });
  const page = await browser.newPage();
  await fingerprintInjector.attachFingerprintToPuppeteer(page, fingerprint);
  if (debug == true) {
    page.on('console', consoleObj => console.log(consoleObj.text()));
  }

  page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36");

  // Intercept requests
  // page.setRequestInterception(true);
  // page.on('request', (req) => {
  //   let reqUrl = req.url();
  //   if (reqUrl.startsWith("https://")) {
  //     if (reqUrl.startsWith("https://www.kitchenwarehouse.com.au")) {
  //       console.log("->", reqUrl);
  //     } else {
  //       console.log("Aborting request for third-party service:", reqUrl)
  //       req.abort()
  //     }
  //   }
  // });

  async function processData(stockData) {
    console.log(stockData);

    var stockAvailability = [];

    for (let stateIndex = 0; stateIndex < stockData.stocks.length; stateIndex++) {
      const state = stockData.stocks[stateIndex];
      // console.log("STATE:", state.id);
      // console.log(state);

      for (let locationIndex = 0; locationIndex < state.locations.length; locationIndex++) {
        const location = state.locations[locationIndex];
        // Push availability data
        stockAvailability.push({ ...location, stateName: state.name, stateId: state.id });
      }
    }

    console.log("All Stock Data:", stockAvailability);

    // Things to do if a discord webhook has been specified
    if (discordWebhookURL) {
      // Send the webhook
      const webhook = new Webhook(discordWebhookURL);

      // Build the string
      var messageArr = [];
      for (store of stockAvailability) {
        messageArr.push(`${store.state}: \t${store.available}`);
      }

      var webhookFields = [];
      // for (store of stockAvailability) {
      //   // webhookFields.push({ name: date.toDateString(), value: value, inline: false });
      //   // webhookFields.push({ name: "Store", value: store.name });
      //   // webhookFields.push({ name: "Stock Available", value: store.available });

      //   // Break out of this loop if webhookFields is equal to or greater than maxRows.
      //   if (webhookFields.length >= maxRows) {
      //     break;
      //   }
      // }

      webhookFooter = {};
      if (githubRefName) {
        webhookFooter.text = `via GitHub ref ${githubRefName}`;
        webhookFooter.url = `https://github.com/jkueh/kitchen-warehouse-stock/runs/${githubJobId}`;
      }

      var totalStock = 0;
      for (store of stockAvailability) {
        totalStock += parseInt(store.available);
      }
      webhookFields.push({ name: "Total Stock", value: totalStock });

      // Create webhook fields for state summary
      for (store of stockAvailability) {
        webhookFields.push({
          name: `${store.name} (${store.stateId})`,
          value: store.available,
          inline: true
        })
      }

      console.log("Sending webhook");
      // await webhook.send(`<@168004824628068352> BVMS Appointments:\n\`\`\`${messageArr.join("\n")}\`\`\``);
      await webhook.send(`<@168004824628068352>`, [
        {
          title: `Stock Levels`,
          fields: webhookFields,
          footer: webhookFooter,
        }
      ]);
    }

    // We've got what we need, time to bail!
    process.exit(0);
  }

  // Intercept responses
  page.on('response', async (resp) => {
    respUrl = resp.url();
    // console.log("<-", respUrl)
    if (respUrl.startsWith("https://www.kitchenwarehouse.com.au/app/site/hosting/scriptlet.nl")) {
      if (/script=3587/.test(respUrl) && /type=check_stock/.test(respUrl)) {
        await processData(JSON.parse(await resp.text())).catch((reason) => {
          console.error(reason);
          process.exit(254);
        });
      }
    }
  })

  await page.goto(productURL, {
    waitUntil: [
      "load",
      "domcontentloaded",
      "networkidle0",
      "networkidle2",
    ],
    timeout: 60000, // Give it a good minute to finish loading the page
  });

  await page.screenshot({ path: 'screenshot.png' });

  await browser.close();
  console.log("All done!");
})().catch((reason) => {
  console.error(reason);
  process.exit(1);
});
