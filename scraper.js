const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const config = require('./config');

let browser = null;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
  }
  return browser;
}

async function fetchCimaNow(url) {
  try {
    const browser = await initBrowser();
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
    });

    console.log(`[PUPPETEER] Navigating to ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if(totalHeight >= scrollHeight){
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    await page.waitForTimeout(2000);

    const html = await page.content();
    await page.close();

    console.log(`[PUPPETEER] Fetched ${html.length} bytes`);
    return html;
  } catch (error) {
    console.error('[PUPPETEER] Error:', error.message);
    throw error;
  }
}

function parseMoviesPage(html) {
  const $ = cheerio.load(html);
  const metas = [];

  $('section[aria-label="posts"] article[aria-label="post"]').each((i, elem) => {
    try {
      const $article = $(elem);
      const $link = $article.find('a').first();
      const href = $link.attr('href');

      const $titleLi = $link.find('ul.info li[aria-label="title"]').first();
      let title = $titleLi.text().trim();
      title = title.replace(/<em>.*?<\/em>/g, '').replace(/\s+/g, ' ').trim();

      const $img = $link.find('img').first();
      let poster = $img.attr('src') || $img.attr('data-src');

      if (title && href && poster) {
        const cleanHref = href.replace(config.BASE_URL, '').replace(/^\//, '');
        metas.push({
          id: `cimanow_movie_${encodeURIComponent(cleanHref)}`,
          type: 'movie',
          name: title,
          poster: poster,
          posterShape: 'poster'
        });
      }
    } catch (err) {}
  });

  return metas;
}

function parseSeriesPage(html) {
  const $ = cheerio.load(html);
  const metas = [];

  $('section[aria-label="posts"] article[aria-label="post"]').each((i, elem) => {
    try {
      const $article = $(elem);
      const $link = $article.find('a').first();
      const href = $link.attr('href');

      const $titleLi = $link.find('ul.info li[aria-label="title"]').first();
      let title = $titleLi.text().trim();
      title = title.replace(/<em>.*?<\/em>/g, '').replace(/\s+/g, ' ').trim();

      const $img = $link.find('img').first();
      let poster = $img.attr('src') || $img.attr('data-src');

      if (title && href && poster) {
        const cleanHref = href.replace(config.BASE_URL, '').replace(/^\//, '');
        metas.push({
          id: `cimanow_series_${encodeURIComponent(cleanHref)}`,
          type: 'series',
          name: title,
          poster: poster,
          posterShape: 'poster'
        });
      }
    } catch (err) {}
  });

  return metas;
}

function parseEpisodesFromHTML(html, seasonNum) {
  const $ = cheerio.load(html);
  const episodes = [];

  $('section[aria-label="details"] ul#eps li a').each((i, el) => {
    const $ep = $(el);
    const epHref = $ep.attr('href');
    const epLabel = $ep.find("b").text() || $ep.attr("aria-label") || "";

    const $em = $ep.find('em');
    const epNumText = $em.text().trim();
    const epNum = parseInt(epNumText) || i + 1;

    let epTitle = epLabel || `الحلقة ${epNum}`;

    // Extract episode thumbnail
    const $img = $ep.find('img').first();
    let thumbnail = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');

    if (!thumbnail) {
      const $liImg = $ep.parent().find('img').first();
      thumbnail = $liImg.attr('src') || $liImg.attr('data-src') || $liImg.attr('data-lazy-src');
    }

    if (epHref) {
      const cleanEpHref = epHref.replace(config.BASE_URL, '').replace(/^\//, '');
      episodes.push({
        id: `cimanow_series_${encodeURIComponent(cleanEpHref)}`,
        title: epTitle,
        season: seasonNum,
        episode: epNum,
        thumbnail: thumbnail || undefined,
        released: ''
      });
    }
  });

  return episodes;
}

// OPTIMIZED: Fetch ONLY current season (fast!)
async function parseMetaPage(html, id, type) {
  const $ = cheerio.load(html);

  const meta = {
    id,
    type,
    name: '',
    poster: config.DEFAULT_POSTER,
    background: undefined,
    description: '',
    genres: [],
    cast: [],
    year: ''
  };

  const $figureImg = $('figure img').first();
  const $articleImg = $('article ul img, article img').first();

  if ($figureImg.length) {
    meta.poster = $figureImg.attr('src') || $figureImg.attr('data-src') || config.DEFAULT_POSTER;
    meta.background = meta.poster;
  } else if ($articleImg.length) {
    meta.poster = $articleImg.attr('src') || $articleImg.attr('data-src') || config.DEFAULT_POSTER;
  }

  meta.name = $figureImg.attr('alt') || $articleImg.attr('alt') || $('h1').first().text().trim() || '';
  meta.description = $('li[aria-label="story"] p').text().trim() || '';

  $('article ul li a[href*="release-year"]').each((i, el) => {
    meta.year = $(el).text().trim();
  });

  $('article ul li a[href*="/actor/"]').each((i, el) => {
    meta.cast.push($(el).text().trim());
  });

  // FAST MODE: Only current season
  if (type === 'series') {
    try {
      // Get current season number
      let currentSeason = 1;

      const activeSeasonText = $('section[aria-label="seasons"] ul li.active a').text().trim();
      if (activeSeasonText) {
        const seasonMatch = activeSeasonText.match(/\d+/);
        if (seasonMatch) currentSeason = parseInt(seasonMatch[0]);
      }

      if (currentSeason === 1) {
        const seasonTitleText = $('section[aria-label="seasons"] span[aria-label="season-title"]').text().trim();
        if (seasonTitleText) {
          const seasonMatch = seasonTitleText.match(/\d+/);
          if (seasonMatch) currentSeason = parseInt(seasonMatch[0]);
        }
      }

      console.log(`[META] Current season: ${currentSeason}`);

      // Parse episodes from CURRENT season only (already loaded HTML)
      meta.videos = parseEpisodesFromHTML(html, currentSeason);

      console.log(`[META] Found ${meta.videos.length} episodes for season ${currentSeason} (FAST MODE)`);

      // Add info about other seasons to description
      const allSeasons = [];
      $('section[aria-label="seasons"] ul li a').each((i, el) => {
        const $season = $(el);
        const seasonText = $season.text().trim();
        const seasonHref = $season.attr('href');

        const seasonMatch = seasonText.match(/\d+/);
        const seasonNum = seasonMatch ? parseInt(seasonMatch[0]) : i + 1;

        if (seasonHref) {
          allSeasons.push({
            season: seasonNum,
            name: seasonText,
            url: seasonHref
          });
        }
      });

      if (allSeasons.length > 1) {
        meta.description += '\n\n📺 المواسم المتاحة: ' + allSeasons.map(s => s.name).join(' • ');
        meta.description += '\n💡 لمشاهدة موسم آخر، ابحث عن اسم المسلسل + رقم الموسم';
      }

    } catch (err) {
      console.error('[META] Error:', err.message);
    }
  }

  return meta;
}

function parseStreamPage(html) {
  const $ = cheerio.load(html);
  const streams = [];

  $('iframe').each((i, elem) => {
    const src = $(elem).attr('src') || $(elem).attr('data-src');
    if (src && !src.includes('ad') && !src.includes('analytics')) {
      streams.push({
        name: 'CimaNow',
        title: `سيرفر ${i + 1}`,
        url: src.startsWith('//') ? `https:${src}` : src
      });
    }
  });

  if (streams.length === 0) {
    streams.push({
      name: 'CimaNow',
      title: 'افتح في المتصفح',
      externalUrl: config.BASE_URL
    });
  }

  return streams;
}

process.on('SIGINT', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});

module.exports = {
  fetchCimaNow,
  parseMoviesPage,
  parseSeriesPage,
  parseMetaPage,
  parseStreamPage
};
