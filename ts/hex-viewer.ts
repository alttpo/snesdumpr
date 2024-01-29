
export class HexViewer extends HTMLElement {
    static observedAttributes = ["rows", "columns", "displayTitle", "filename", "address", "offset"];

    private table: HTMLTableElement | null = null;

    private _data : Uint8Array = new Uint8Array(0);
    private _offset: number = 0;
    private _address: number = 0;
    private _rows: number = 16;
    private _columns: number = 16;
    private _displayTitle: string = '';
    private _filename: string = '';

    private downloadLink: HTMLAnchorElement | null = null;

    get data() { return this._data; }
    set data(a : Uint8Array) {
        this._data = a;
        this.render();
    }

    get rows(): number { return this._rows; }
    set rows(value: number) {
        this._rows = value;
        this.connectedCallback();
    }

    get columns(): number { return this._columns; }
    set columns(value: number) {
        this._columns = value;
        this.connectedCallback();
    }

    get displayTitle(): string {return this._displayTitle;}
    set displayTitle(value: string) {
        this._displayTitle = value;
        this.render();
    }

    get filename(): string {return this._filename;}
    set filename(value: string) {
        this._filename = value;
        this.render();
    }

    get address() { return this._address; }
    set address(v : number) {
        this._address = v;
        this.render();
    }

    get offset() { return this._offset; }
    set offset(v : number) {
        this._offset = v;
        this.render();
    }

    constructor() {
        super();

        const shadow = this.attachShadow({mode: "open"});

        const container = document.createElement('div');
        container.innerHTML = `<style>
/* http://meyerweb.com/eric/tools/css/reset/ 
   v2.0 | 20110126
   License: none (public domain)
*/

html, body, div, span, applet, object, iframe,
h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code,
del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var,
b, u, i, center,
dl, dt, dd, ol, ul, li,
fieldset, form, input, label, legend,
table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, 
figure, figcaption, footer, header, hgroup, 
menu, nav, output, ruby, section, summary,
time, mark, audio, video {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 100%;
  font: inherit;
  vertical-align: baseline;
}
/* HTML5 display-role reset for older browsers */
article, aside, details, figcaption, figure, 
footer, header, hgroup, menu, nav, section {
  display: block;
}
body {
  line-height: 1;
}
ol, ul {
  list-style: none;
}
blockquote, q {
  quotes: none;
}
blockquote:before, blockquote:after,
q:before, q:after {
  content: '';
  content: none;
}
table {
  border-collapse: collapse;
  border-spacing: 0;
}
</style>

<style>
#t {
    font-family: monospace;
}

#t th,td {
    border: 0;
    border-collapse: collapse;
    padding: 2px;
}
#t tr:nth-child(odd) {
    background-color: #ccc;
}
td.z {
    color: #888;
}
#offset {
    font-family: monospace;
    width: 6ch;
    border: 0;
    margin: 0;
    padding: 0;
    background-color: chartreuse;
}
</style><table id="t"></table>`;

        shadow.appendChild(container);
    }

    connectedCallback() {
        // reset the table:
        this.table = this.shadowRoot!!.getElementById('t') as HTMLTableElement;
        this.table.innerHTML = '';

        let rows = this._rows;
        let columns = this._columns;

        // create thead:
        {
            let head = this.table.createTHead();
            head.innerHTML = '';

            {
                let row = head.insertRow();
                let cell = row.insertCell();
                cell.colSpan = columns + 1;
                cell.style.textAlign = 'center';

                let link = document.createElement('a');
                link.href = "#";
                link.download = "data.bin";
                link.innerText = `${this._displayTitle}`;
                link.title = `Download ${this._displayTitle} As Raw Binary Data`;

                this.downloadLink = link;
                cell.appendChild(link);
            }

            {
                let row = head.insertRow();
                let cell = row.insertCell();
                let offsetInput = document.createElement('input');
                offsetInput.id = 'offset';
                offsetInput.placeholder = 'offset';
                offsetInput.value = this._offset.toString(16).padStart(6, '0');
                let wc = this;
                offsetInput.addEventListener('change', function () {
                    // parse the value and hand it to the web component:
                    let v = this.value;
                    const n = parseInt(v, 16) || 0;
                    wc.offset = n;
                    // reformat the value:
                    v = n.toString(16).toUpperCase().padStart(6, '0');
                    this.value = v;
                });
                cell.appendChild(offsetInput);

                for (let i = 0; i < columns; i++) {
                    row.insertCell().textContent = i.toString(16).toUpperCase();
                }
            }
        }

        // create tbody:
        {
            let body = this.table.createTBody();
            for (let j = 0; j < rows; j++) {
                let row = body.insertRow();
                row.insertCell().textContent = "------";
                for (let i = 0; i < columns; i++) {
                    row.insertCell().textContent = "--";
                }
            }
        }

        this.render();
    }

    render() {
        // update title / download link:
        if (this.downloadLink) {
            let link = this.downloadLink;
            link.href = URL.createObjectURL(new Blob([this._data]));
            link.download = this._filename;
            link.innerText = `Download ${this._displayTitle}`;
        }

        let rows = this._rows;

        let columns = this._columns;
        let len = this._data.length;
        let p = (this._offset ?? 0);
        p = Math.floor(p / columns) * columns;

        let tBody = this.table!!.tBodies[0]!!;
        for (let r = 0; r < rows; r++) {
            let row = tBody.rows[r]!!;
            row.cells[0].textContent = (p+this._address).toString(16).toUpperCase().padStart(6, '0');
            for (let c = 0; c < columns; c++, p++) {
                let cell = row.cells[1+c];
                if (p < len) {
                    let d = this._data[p];
                    cell.textContent = d.toString(16).toUpperCase().padStart(2, '0');
                    if (d == 0) {
                        cell.className = "z";
                    } else {
                        cell.className = "";
                    }
                } else {
                    cell.textContent = "--";
                }
            }
        }
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        switch (name) {
            case 'rows':
                this._rows = parseInt(newValue || '16', 10);
                this.connectedCallback();
                break;
            case 'columns':
                this._columns = parseInt(newValue || '16', 10);
                this.connectedCallback();
                break;
            case 'address':
                this._address = parseInt(newValue || '0', 16);
                this.render();
                break;
            case 'offset':
                this._offset = parseInt(newValue || '0', 16);
                this.render();
                break;
            case 'displayTitle':
                this._displayTitle = newValue || '';
                this.render();
                break;
            case 'filename':
                this._filename = newValue || '';
                this.render();
                break;
        }
    }
}

customElements.define('hex-viewer', HexViewer);
