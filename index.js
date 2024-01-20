import puppeteerExtra from "puppeteer-extra"
import stealthPlugin from "puppeteer-extra-plugin-stealth"
import chromium from "@sparticuz/chromium"
import * as cheerio from "cheerio";
import { MongoClient, ServerApiVersion } from 'mongodb';


async function scrape(query) {
    try {
      puppeteerExtra.use(stealthPlugin());
  

    // for dev use only run locally
    //   const browser = await puppeteerExtra.launch({
    //     headless: false,
    //     // devtools: true,
    //     executablePath:
    //       "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    //   });
      

      // for production use run lambda
      const browser = await puppeteerExtra.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: "new",
        ignoreHTTPSErrors: true,
      });
  
      const page = await browser.newPage();
  
      await page.goto(
        `https://www.google.com/search?q=${query.split(" ").join("+")}`
      );
  
      async function autoScroll(page) {
        await page.evaluate(async () => {
          let wrapper = document.querySelector("html");
  
          await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 1000;
            var scrollDelay = 2000;
  
            var timer = setInterval(async () => {
              var scrollHeightBefore = wrapper.scrollHeight;
              wrapper.scrollBy(0, distance);
              totalHeight += distance;
  
              if (totalHeight >= scrollHeightBefore) {
                totalHeight = 0;
                await new Promise((resolve) => setTimeout(resolve, scrollDelay));
  
                // Calculate scrollHeight after waiting
                var scrollHeightAfter = wrapper.scrollHeight;
  
                if (scrollHeightAfter > scrollHeightBefore) {
                  // More content loaded, keep scrolling
                  return;
                } else {
                  // No more content loaded, stop scrolling
                  clearInterval(timer);
                  resolve();
                }
              }
            }, 100);
          });
        });
      }
  
      await autoScroll(page);
  
      await page.evaluate(() => {
        function scrollToBottom() {
          window.scrollTo(0, document.body.scrollHeight);
        }
  
        function clickMoreResults() {
          const h3Elements = document.querySelectorAll("h3");
  
          for (const h3 of h3Elements) {
            if (h3.textContent.includes("More results")) {
              h3.click();
              return true; // Indicate that the "More results" was clicked
            }
          }
  
          return false; // Indicate that no "More results" was found
        }
  
        // Function to repeatedly click and scroll
        function loadMoreResults() {
          const interval = setInterval(() => {
            const clicked = clickMoreResults();
            if (clicked) {
              scrollToBottom();
            } else {
              clearInterval(interval); // Stop the loop if no more "More results" are found
            }
          }, 1000); // Adjust the interval as needed
        }
  
        loadMoreResults();
      });
  
      await page.waitForTimeout(5000);
  
      const html = await page.content();
      const pages = await browser.pages();
      await Promise.all(pages.map((page) => page.close()));
  
      await browser.close();
      console.log("browser closed");
  
      const $ = cheerio.load(html);
      const h3s = [];
      const links = [];
      // get all h3 tags
      const h3Tags = $("h3");
      const all = [];
      h3Tags.each((i, h3Tag) => {
        const parent = $(h3Tag).parent();
        const link = $(parent).attr("href");
        const text = $(h3Tag).text().trim();
        h3s.push(text);
        all.push({ text, link });
      });
      const json = [];
      h3s.forEach((h3, i) => {
        json.push({ title: h3, link: links[i] });
      });
      
    
    const filteredResults = all.slice(3, -2); // remove unwanted result
    
    // testing only if you want to write to file locally
    // fs.writeFileSync("./test.json", JSON.stringify(filteredResults, null, 2)); 
    
      return filteredResults;
    } catch (error) {
      console.log("error at scrape", error.message);
    }
  }

  async function saveToMongoDB(data) {

    const uri = "mongodb+srv://google:gtx12345@cluster0.k4kbsvc.mongodb.net/?retryWrites=true&w=majority"; // database uri

    const client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        }
      });  

    try {
      await client.connect();
      console.log("Connected to MongoDB");
  
      const database = client.db("google"); //  database name
      const collection = database.collection("scrappes"); //  collection name
  
      // Insert the data into the collection
      await collection.insertMany(data);
  
      console.log("Data saved to MongoDB");
    } finally {
      await client.close();
      console.log("Connection to MongoDB closed");
    }
    
  }

export const handler = async (event, context) => {
    try{
    const body = JSON.parse(event.body);
    const {query} = body;

    const data = await scrape(query);
    await saveToMongoDB(data);
    console.log(data);
    
    return {
        statusCode: 200,
        body: JSON.stringify(data)
    }

    }catch (error){
        console.log("error at index.js", error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
            })
        }
    }
};

// local use only
// handler({
//     body: JSON.stringify({
//         query: "hotel"
//     })
// })