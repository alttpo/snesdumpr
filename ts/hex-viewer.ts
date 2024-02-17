
export class HexViewer extends HTMLElement {
    static observedAttributes = [
        "rows",
        "columns",
        "displayTitle",
        "filename",
        "address",
        "offset",
        "css-zero"
    ];

    // internal state:
    private table: HTMLTableElement | null = null;
    private downloadLink: HTMLAnchorElement | null = null;

    // property-backing fields:
    private _data : Uint8Array = new Uint8Array(0);

    // attribute- and property-backing fields:
    private _rows: number = 16;
    private _columns: number = 16;
    private _address: number = 0;
    private _offset: number = 0;
    private _displayTitle: string = '';
    private _filename: string = '';
    private _css_zero: string = '';

    private _offsetInput: HTMLInputElement | null = null;

    // public properties:
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

    get displayTitle(): string { return this._displayTitle; }
    set displayTitle(value: string) {
        this._displayTitle = value;
        this.render();
    }

    get filename(): string { return this._filename; }
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
        if (v < 0) { v = 0; }
        if (v > this._data.length) { v = this._data.length; }

        this._offset = v;

        // set the value on the input element:
        if (this._offsetInput) {
            this._offsetInput.value = (Math.floor(v / this._columns) * this._columns)
                .toString(16)
                .toUpperCase()
                .padStart(6, '0');
        }

        this.render();
    }

    constructor() {
        super();
    }

    connectedCallback() {
        // select the first <table> element or create a new one and append it:
        this.table = (this.querySelector('table') as HTMLTableElement)
            ?? (this.appendChild(document.createElement('table')));
        // reset the table:
        this.table.innerHTML = '';

        let rows = this._rows;
        let columns = this._columns;

        // caption:
        {
            let caption = this.table.appendChild(document.createElement('caption'));
            caption.style.textAlign = 'center';

            let link = document.createElement('a');
            link.href = "#";
            link.download = "data.bin";
            link.innerText = `${this._displayTitle}`;
            link.title = `Download ${this._displayTitle} As Raw Binary Data`;

            this.downloadLink = link;
            caption.appendChild(link);
        }

        // create thead:
        {
            let head = this.table.createTHead();
            head.innerHTML = '';

            {
                let row = head.insertRow();
                let cell = row.insertCell();
                let offsetInput = document.createElement('input');
                offsetInput.className = 'offset';
                offsetInput.placeholder = 'offset';
                offsetInput.value = Math.floor(this._offset).toString(16).padStart(6, '0');
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
                this._offsetInput = offsetInput;

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
                row.insertCell().textContent = "................";
            }

            let wc = this;
            body.addEventListener('wheel', function (e) {
                e.preventDefault();
                // console.log(e);
                wc.offset += e.deltaY * 0.125 * wc._columns;
            });
        }

        this.render();
    }

    render() {
        if (!this.table) {
            return;
        }

        // update title / download link:
        if (this.downloadLink) {
            let link = this.downloadLink;
            link.href = URL.createObjectURL(new Blob([this._data]));
            link.download = this._filename;
            link.innerText = this._displayTitle;
        }

        let rows = this._rows;

        let columns = this._columns;
        let len = this._data.length;
        let p = Math.floor(this._offset ?? 0);
        p = Math.floor(p / columns) * columns;

        let tBody = this.table!!.tBodies[0]!!;
        for (let r = 0; r < rows; r++) {
            let ascii : string[] = [];
            let row = tBody.rows[r]!!;
            row.cells[0].textContent = (p+this._address).toString(16).toUpperCase().padStart(6, '0');
            for (let c = 0; c < columns; c++, p++) {
                let cell = row.cells[1+c];
                if (p < len) {
                    let d = this._data[p];
                    cell.textContent = d.toString(16).toUpperCase().padStart(2, '0');
                    if (this._css_zero != '' && d == 0) {
                        cell.className = this._css_zero;
                        ascii.push(`<span class="${this._css_zero}">.</span>`);
                    } else {
                        cell.className = '';
                        if (d >= 32 && d < 127) {
                            ascii.push(String.fromCharCode(d));
                        } else {
                            ascii.push('.');
                        }
                    }
                } else {
                    cell.className = '';
                    cell.textContent = "--";
                    ascii.push('-');
                }
            }
            row.cells[1+columns].innerHTML = '<pre>' + ascii.join('') + '</pre>';
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
            // CSS related:
            case 'css-zero': // the class to apply to a <td> when its data is 0-valued.
                this._css_zero = newValue || '';
                this.render();
                break;
        }
    }
}

customElements.define('hex-viewer', HexViewer);
