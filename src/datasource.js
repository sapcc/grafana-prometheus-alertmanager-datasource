import _ from "lodash";

export class GenericDatasource {

  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.silenced = typeof instanceSettings.jsonData.silenced !== "undefined" ? instanceSettings.jsonData.silenced : false;
    this.severityLevels = {}
    this.severityLevels[instanceSettings.jsonData.severity_critical.toLowerCase()]  = 4;
    this.severityLevels[instanceSettings.jsonData.severity_high.toLowerCase()]      = 3;
    this.severityLevels[instanceSettings.jsonData.severity_warning.toLowerCase()]   = 2;
    this.severityLevels[instanceSettings.jsonData.severity_info.toLowerCase()]      = 1;
    this.q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
  }

    async query(options) {
        let query = this.buildQueryParameters(options);
        query.targets = query.targets.filter(t => !t.hide);

        if (query.targets.length <= 0) {
            return this.q.when({data: []});
        }
        let results = {
            "data": []
        }
        let queryPromises = [];
        query.targets.forEach(target => {
            var queryString = this.templateSrv.replace(target.expr, options.scopedVars);
            var querySilenced = this.silenced;
            if (queryString) {
                var {queryString, querySilenced} = this.parseQuery(queryString)
            }
            if(target.type === "table"){
                // Format data for table panel
                queryPromises.push(this.formatDataTable(query, queryString, querySilenced));
            } else {
                queryPromises.push(this.formatDataStat(query, queryString, querySilenced, target.alias));
            }
        });
        let result = await Promise.all(queryPromises);
        results.data = result;
        return results;
    }

    async formatDataTable(query, queryString, silenced) {
        let labelSelector = this.parseLabelSelector(query.targets[0].labelSelector);
        const response = await this.makeRequest(query, queryString, silenced);
        let results = {
            "rows": [],
            "columns": [],
            "type": "table"
        };

        if(response.data && response.data.data && response.data.data.length) {
            let data = this.filterSilencedOnlyData(response.data.data, silenced)
            let columnsDict = this.getColumnsDict(data, labelSelector);
            results.columns = this.getColumns(columnsDict);

            for (let i = 0; i < data.length; i++) {
                let row = new Array(results.columns.length).fill("");
                let item = data[i];

                for (let label of Object.keys(item['labels']).concat(Object.keys(item)).concat(Object.keys(item['status'])) ) {
                    if(label in columnsDict) {
                        switch(label) {
                            case 'severity':
                                row[columnsDict[label]] = this.severityLevels[item['labels'][label]];
                                break;
                            case 'startsAt':
                                row[columnsDict[label]] = [Date.parse(item['startsAt'])];
                                break;
                            case 'endsAt':
                                row[columnsDict[label]] = item['endsAt'];
                                break;
                            case 'silencedBy':
                                const silencedByID = item['status']['silencedBy'][0];
                                if (silencedByID) {
                                    try {
                                        const silencedBy = await this.getSilencedByUser(silencedByID);
                                        row[columnsDict[label]] = silencedBy.data.data.createdBy;;
                                    } catch(err) {
                                        console.error(err)
                                    }
                                }
                                break;
                            default:
                                row[columnsDict[label]] = item['labels'][label];
                        }
                    }
                }
                for (let annotation of Object.keys(item['annotations'])) {
                    if(annotation in columnsDict) {
                        row[columnsDict[annotation]] = item['annotations'][annotation];
                    }
                }
                results.rows.push(row);
            }
        }
        return results;
    }

    formatDataStat(query, queryString, silenced, alias) {
        return this.makeRequest(query, queryString, silenced).then(response => {
            let data = this.filterSilencedOnlyData(response.data.data, silenced)
            return {
                "datapoints": [ [data.length, Date.now()] ], "target": alias
            }
        });
    }

    makeRequest(query, queryString, silenced) {
        let bSilenced = silenced === "only" || silenced ? true : false;
        let filter = encodeURIComponent(queryString || "");
        return this.backendSrv.datasourceRequest({
            url: `${this.url}/api/v1/alerts?silenced=${bSilenced}&inhibited=false&filter=${filter}`,
            data: query,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
    }

    getSilencedByUser(id) {
        return this.backendSrv.datasourceRequest({
            url: `${this.url}/api/v1/silence/${id}`,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
    }

    parseQuery(queryString) {
        const silencedRegex = /=(.*)/;
        let aQueries = queryString.split(",");
        let querySilenced = false;
        aQueries = aQueries.filter(q => {
            if (q.includes("silenced=")) {
                let r = silencedRegex.exec(q);
                if (r != null) {
                    try {
                        querySilenced = JSON.parse(r[1]);
                    }catch(err) {
                        if (r[1] === "only") {
                            querySilenced = "only";
                        } else {
                            console.error("error casting silenced value", err)
                        }
                    }
                }
                return false
            } else {
                return true
            }
        });
        queryString = aQueries.join(",")
        queryString = queryString.replace(/\s/g, "");
        return {queryString, querySilenced};
    }

    filterSilencedOnlyData(data, silenced) {
        if (silenced !== "only") {
            return data;
        }
        return data.filter(d => {
            if (d.status.silencedBy.length === 0) {
                return false;
            }
            return true;
        });
    }

    getColumns(columnsDict) {
        let columns =  [];
        for(let column of Object.keys(columnsDict)) {
            switch(column) {
                case "startsAt":
                    columns.push({ text: column, type: "time" });
                    break;
                default:
                    columns.push({ text: column, type: "string" });
            }
            
        }
        return columns;
    }

    // Parses the label list into a map
    parseLabelSelector(input) {
        var map;
        if (typeof(input) === "undefined" || input.trim().length === 0) {
            map = ["*"];
        } else {
            map = input.trim().split(/\s*,\s*/);
        }
        return map;
    }

    // Creates a column index dictionary in to assist in data row construction
    getColumnsDict(data, labelSelector) {
        let index = 0;
        let columnsDict = {};
        for (let i = 0; i < data.length; i++) {
            for (let labelIndex = 0; labelIndex < labelSelector.length; labelIndex++) {
                var selectedLabel = labelSelector[labelIndex];
                if (selectedLabel === "*") {
                    // '*' maps to all labels/annotations not already added via the label selector list
                    for (let label of Object.keys(data[i]['labels'])) {
                        if(!(label in columnsDict) && label !== 'severity') {
                            columnsDict[label] = index++;
                        }
                    }
                    for (let annotation of Object.keys(data[i]['annotations'])) {
                        if(!(annotation in columnsDict)) {
                            columnsDict[annotation] = index++;
                        }
                    }
                } else if (!(selectedLabel in columnsDict)) {
                    columnsDict[selectedLabel] = index++;
                }
            }
        }
        columnsDict['severity'] = index;
        return columnsDict;
    }

    testDatasource() {
        return this.backendSrv.datasourceRequest({
            url: this.url + '/api/v1/status',
            method: 'GET'
        }).then(response => {
            if (response.status === 200) {
                return { status: "success", message: "Data source is working", title: "Success" };
            }
        });
    }

    buildQueryParameters(options) {
        //remove placeholder targets
          options.targets = _.filter(options.targets, target => {
          return target.target !== 'select metric';
        });
          options.targetss = _.map(options.targets, target => {
          return {
            target: this.templateSrv.replace(target.target),
            expr: target.expr,
            refId: target.refId,
            hide: target.hide,
            type: target.type || 'single',
            legendFormat: target.legendFormat || ""
          };
        });
        return options;
      }

    formatInstanceText(labels, legendFormat){
    if(legendFormat === ""){
      return JSON.stringify(labels);
    }
    let aliasRegex = /\{\{\s*(.+?)\s*\}\}/g;
    return legendFormat.replace(aliasRegex, function(match, g1) {
      if (labels[g1]) {
        return labels[g1];
      }
      return "";
    });
  }
}
