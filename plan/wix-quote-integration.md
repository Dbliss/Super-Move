# Wix quote integration

Use this flow:

1. The Vue quote builder is embedded in Wix as an HTML iframe/component.
2. The Vue app sends quote data to Wix with `postMessage`.
3. Wix page code receives the message and calls a backend web module.
4. The web module saves the quote to a Wix CMS collection.
5. A Wix Automation sends the email when a new quote record is created.

This keeps the email logic inside Wix and avoids exposing API keys in the iframe.

## 1. Create the CMS collection

In Wix CMS, create a collection named:

```text
QuoteRequests
```

Add these fields. The field IDs matter:

```text
title
fullName
email
phone
pickupAddress
dropoffAddress
preferredMoveDate
notes
estimate
homeSize
recommendedTruck
testNotificationEmail
businessNotificationEmail
quoteJson
```

Use `Text` for most fields. Use `Email` for `email`, `testNotificationEmail`, and `businessNotificationEmail`. Use `Multiline text` for `notes` and `quoteJson`.

## 2. Backend web module

Create a backend web module named:

```text
quote_email.web.js
```

Replace Wix's default `multiply` sample with this:

```js
import { Permissions, webMethod } from "wix-web-module";
import wixData from "wix-data";

export const sendQuoteEmail = webMethod(
  Permissions.Anyone,
  async (quote) => {
    const customer = quote.customer || {};
    const estimate = quote.estimate || {};
    const move = quote.move || {};

    const item = {
      title: `Quote request - ${customer.fullName || "Customer"}`,
      fullName: customer.fullName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      pickupAddress: customer.pickupAddress || "",
      dropoffAddress: customer.dropoffAddress || "",
      preferredMoveDate: customer.preferredMoveDate || "",
      notes: customer.notes || "",
      estimate: estimate.formattedTotal || "",
      homeSize: move.homeSize || "",
      recommendedTruck: move.recommendedTruck || "",
      testNotificationEmail: "dillon.bliss@outlook.com",
      businessNotificationEmail: "supermovesydney@gmail.com",
      quoteJson: JSON.stringify(quote, null, 2),
    };

    const saved = await wixData.insert("QuoteRequests", item);
    return { ok: true, id: saved._id };
  }
);
```

## 3. Wix page code

Add the quote app as an HTML component/iframe, then set its element ID to:

```text
quoteFrame
```

In the page code for the Wix page that contains the iframe:

```js
import { sendQuoteEmail } from "backend/quote_email.web";

function getQuoteFrames() {
  const frames = [];

  try {
    const quoteFrame = $w("#quoteFrame");
    if (quoteFrame && typeof quoteFrame.onMessage === "function") {
      frames.push(quoteFrame);
    }
  } catch (error) {
    // The iframe may have a different ID in Wix.
  }

  try {
    $w("HtmlComponent").forEach((component) => {
      if (component && typeof component.onMessage === "function" && !frames.includes(component)) {
        frames.push(component);
      }
    });
  } catch (error) {
    // No HTML components found on this page.
  }

  return frames;
}

$w.onReady(() => {
  getQuoteFrames().forEach((frame) => {
    frame.onMessage(async (event) => {
      const message = event.data;
      if (!message || message.type !== "superMove.quoteSubmitted") return;

      try {
        await sendQuoteEmail(message.payload);
        console.log("Quote request saved.");
      } catch (error) {
        console.error("Quote request failed:", error);
      }
    });
  });
});
```

This code uses `#quoteFrame` if that ID exists, and otherwise attaches to any Wix HTML component on the page.

## 4. Wix Automation email

In Wix Automations:

1. Create a new automation.
2. Use a CMS/Data trigger for when a new item is added to `QuoteRequests`.
3. Add a `Send email` action.
4. Set recipients to `Emails from trigger`, then select:

```text
testNotificationEmail
businessNotificationEmail
```

This sends each quote notification to both `dillon.bliss@outlook.com` and `supermovesydney@gmail.com`.

5. Insert dynamic fields from the new collection item, such as:
5. Insert dynamic fields from the new collection item, such as:

```text
fullName
email
phone
pickupAddress
dropoffAddress
preferredMoveDate
estimate
homeSize
recommendedTruck
notes
quoteJson
```

To test, activate the automation and add a test item to `QuoteRequests` or submit a quote from the published Wix page. The inserted item should include:

```text
testNotificationEmail: dillon.bliss@outlook.com
businessNotificationEmail: supermovesydney@gmail.com
```

## Notes

The quote builder posts this message to Wix:

```js
{
  type: "superMove.quoteSubmitted",
  payload: {
    source: "super-move-quote-builder",
    type: "superMove.quoteSubmitted",
    submittedAt: "2026-06-12T05:03:21.846Z",
    customer: {},
    move: {},
    extras: []
  }
}
```

Test this on the published Wix site, not only Preview. Wix messaging and backend calls can behave differently in Preview.
