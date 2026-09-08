# Print Big

Print a poster on a normal printer. Print Big cuts a picture into Letter or A4 sized pages, adds a small overlap and cut marks, and gives you one PDF to print. You tape the pages together.

Live: https://printbig.mpeddicord.com/

Everything runs in the browser. The picture is never uploaded anywhere.

## How to use it

1. Open the page and drop in a picture (or tap to choose one; on a phone you can pick a photo from the camera roll).
2. Set the finished width or height. The other one follows the picture's proportions. Switch between inches and cm as you like.
3. Pick the paper size (US Letter or A4, also Legal and Tabloid) and orientation. "Auto" picks whichever needs fewer pages.
4. Watch the preview: it shows the page grid over the picture, the page count, and roughly how sharp the result will be (dots per inch at the finished size).
5. Click **Download PDF**. If you prefer, **Print** sends the same pages straight to the browser's print dialog.
6. Print every page at **100% / Actual size**. Never use "Fit to page".
7. The first page is an assembly sheet with a 1-inch square. Measure it. If it is not exactly 1 inch (2.54 cm), the print scale is wrong; fix that before cutting.
8. Page 1 of the picture stays whole. Every other page: cut along its dashed edge(s), lay it over the neighbouring page so the picture lines up, tape. Small ticks in the margins show where the next page's edge lands.

## Settings

| Setting | Default | Notes |
| --- | --- | --- |
| Paper | US Letter | A4, Legal, Tabloid also available |
| Orientation | Auto | fewest pages wins, ties go to portrait |
| Finished width | 24 in | height follows the picture's aspect ratio |
| Overlap | 0.25 in | how much each page is taped over its neighbour |
| Printer margin | 0.3 in | unprintable border most home printers have |
| Cut marks | on | dashed cut lines, corner marks, seam ticks |
| Page labels | on | "page 3/8   row 1, col 3" plus which edge to cut |
| Assembly sheet | on | cover page with instructions, 1-inch check square and a numbered map |

Pages are rendered at up to 300 dpi and never below 150 dpi; the picture is never upscaled beyond what it has. Very large pictures are decoded at a maximum of about 32 megapixels to keep memory in check.

## Running it yourself

There is no build step. Open `index.html` from any static web server (the sample picture button needs http, not `file://`). The only dependency is jsPDF, loaded from cdnjs with a pinned version and integrity hash.

The end-to-end test drives Microsoft Edge headlessly through `puppeteer-core`: it loads the sample, checks the page count, downloads two PDFs and verifies their page counts and page sizes.

```
cd test
npm install
node run.mjs            # optional: node run.mjs shot.png    URL=https://... node run.mjs
```

Set `EDGE` to the path of any Chromium based browser if Edge is not at its default location.

## Background

This is the web version of `print_big.py`, a small Python command-line script that did the same thing with Pillow. The page layout rules, margins, overlap, cut marks and the assembly sheet are the same.

## License

MIT. See `LICENSE`.
