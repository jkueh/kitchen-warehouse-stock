const puppeteer = require('puppeteer');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));

const debug = process.env.DEBUG?.toLowerCase().trim() == 'true';

var githubRefName = process.env.GITHUB_REF_NAME;
var githubJobId = process.env.GITHUB_JOB;

const productURL = process.env.PRODUCT_URL;
const discordWebhookURL = process.env.DISCORD_WEBHOOK_URL;

const { Webhook } = require('simple-discord-webhooks');

var exitWithError = false;
if (!productURL) {
  console.error("PRODUCT_URL not set");
  exitWithError = true;
}

if (exitWithError) {
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    executablePath: path.resolve("/usr/bin/google-chrome"),
  });
  const page = await browser.newPage();
  if (debug == true) {
    page.on('console', consoleObj => console.log(consoleObj.text()));
  }

  page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36");

  // Intercept responses
  page.on('response', (resp) => {
    console.log("Response received from:", resp.url())
  })

  await page.goto(productURL, {
    waitUntil: [
      "load",
      "domcontentloaded",
      "networkidle0",
      "networkidle2",
    ]
  });

  // Things to do if a discord webhook has been specified
  if (discordWebhookURL) {
    // Send the webhook
    const webhook = new Webhook(discordWebhookURL);

    // Build the string
    var messageArr = [];
    for (const [key, value] of Object.entries(appointmentData)) {
      messageArr.push(`${key}: ${value}`);
    }

    var webhookFields = [];
    for (const [key, value] of Object.entries(appointmentData)) {
      let date = new Date(Date.parse(key));
      // let dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      webhookFields.push({ name: date.toDateString(), value: value, inline: false });

      // Break out of this loop if webhookFields is equal to or greater than maxRows.
      if (webhookFields.length >= maxRows) {
        break;
      }
    }

    webhookFooter = {};
    if (githubRefName) {
      webhookFooter.text = `via GitHub ref ${githubRefName}`;
      webhookFooter.url = `https://github.com/jkueh/kitchen-warehouse-stock/runs/${githubJobId}`;
    }

    console.log("Sending webhook");
    // await webhook.send(`<@168004824628068352> BVMS Appointments:\n\`\`\`${messageArr.join("\n")}\`\`\``);
    await webhook.send(`<@168004824628068352>`, [
      {
        title: `Appointments available at Bupa ${locationName}`,
        fields: webhookFields,
        footer: webhookFooter,
      }
    ]);
  }

  await page.screenshot({ path: 'screenshot.png' });

  await browser.close();
  console.log("All done!");
})();
