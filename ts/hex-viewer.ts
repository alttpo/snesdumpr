
export class HexViewer extends HTMLElement {
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

    get address() { return this._address; }
    set address(v : number) {
        this._address = v;
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
table,
th,
td {
    border: 0;
    border-collapse: collapse;
    padding: 2px;
    font-family: monospace;
}
tr:nth-child(odd) {
    background-color: #ccc;
}
td.z {
    color: #888;
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
                cell.textContent = this._displayTitle;
            }

            {
                let row = head.insertRow();
                row.insertCell().textContent = ''; // address
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

        // create tfoot:
        {
            let foot = this.table.createTFoot();
            let cell = foot.insertRow().insertCell()
            cell.colSpan = columns + 1;

            let link = document.createElement('a');
            link.href = "#";
            link.download = "data.bin";
            link.innerText = `Download ${this._displayTitle}`;
            this.downloadLink = link;

            cell.appendChild(link);
        }

        this.render();
    }

    render() {
        // update title:
        let tHead = this.table!!.tHead!!;
        tHead.rows[0].cells[0].textContent = this._displayTitle;

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

    attributeChangedCallback() {
        let lastRows = this._rows;
        let lastColumns = this._columns;
        this._rows = parseInt(this.getAttribute('rows') || '16', 10);
        this._columns = parseInt(this.getAttribute('columns') || '16', 10);
        if (this._rows != lastRows || this._columns != lastColumns) {
            // reconstruct the <table> layout:
            this.connectedCallback();
        }

        // re-render data:
        this._address = parseInt(this.getAttribute('address') || '0', 10);
        this.render();
    }
}

customElements.define('hex-viewer', HexViewer);
