async function fetchBackgrounds() {
    try {
        const response = await fetch('assets/00_backgrounds.json');
        if (!response.ok) {
            throw new Error('画像リストの取得に失敗しました');
        }
        const backgrounds = await response.json();
        generateBackgroundMenu(backgrounds);
    } catch (error) {
        console.error(error);
    }
}

function generateBackgroundMenu(backgroundImages) {
    const menu = document.getElementById("backgroundMenu");
    menu.innerHTML = "";

    backgroundImages.forEach(image => {
        const item = document.createElement("div");
        item.className = "background-item";
        item.innerHTML = `<img src="${image.src}" alt="${image.name}">`;
        item.title = image.name;

        item.addEventListener("click", () => setCanvasBackground(image.src));
        menu.appendChild(item);
    });
}

function setCanvasBackground(imageSrc) {
    const image = new Image();
    image.onload = function () {
        const canvas = document.getElementById("canvas");
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = imageSrc;
}

// Excelファイルを自動で読み込む関数
async function readExcelAutomatically() {
    return new Promise(async (resolve, reject) => {
          try {
              const response = await fetch('assets/data.xlsx');
              if (!response.ok) {
                  throw new Error('Excelファイルの取得に失敗しました');
              }
  
              const arrayBuffer = await response.arrayBuffer();
              const workbook = XLSX.read(arrayBuffer, { type: 'array' });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
  
              data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
              createMenu(); // メニュー生成
              resolve(); // 成功時に解決
          } catch (error) {
              console.error('Excelファイルの読み込みに失敗しました', error);
              reject(error); // 失敗時にエラーを返す
          }
      });
  }
  

window.onload = fetchBackgrounds,readExcelAutomatically;
