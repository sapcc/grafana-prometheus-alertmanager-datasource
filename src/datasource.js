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

    query(options) {
        let query = this.buildQueryParameters(options);
        query.targets = query.targets.filter(t => !t.hide);

        if (query.targets.length <= 0) {
            return this.q.when({data: []});
        }
        // Format data for table panel
        if(query.targets[0].type === "table"){
            var labelSelector = this.parseLabelSelector(query.targets[0].labelSelector);

            let queryString = this.templateSrv.replace(query.targets[0].expr, options.scopedVars);
            if (queryString) {
                queryString = this.parseQuery(queryString)
            }
            let filter = encodeURIComponent(queryString || "");
            return this.backendSrv.datasourceRequest({
                    url: `${this.url}/api/v1/alerts?silenced=${this.silenced}&inhibited=false&filter=${filter}`,
                    data: query,
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                }).then(response => {
                    let results = {
                        "data": [{
                            "rows": [],
                            "columns": [],
                            "type": "table"
                            }
                        ]
                    };

                if(response.data && response.data.data && response.data.data.length) {
                    let columnsDict = this.getColumnsDict(response.data.data, labelSelector);
                    results.data[0].columns = this.getColumns(columnsDict);

                    for (let i = 0; i < response.data.data.length; i++) {
                        let row = new Array(results.data[0].columns.length).fill("");
                        let item = response.data.data[i];
                        row[0] = [Date.parse(item['startsAt'])];

                        for (let label of Object.keys(item['labels'])) {
                            if(label in columnsDict) {
                                if(label === 'severity') {
                                    row[columnsDict[label]] = this.severityLevels[item['labels'][label]]
                                }
                                else {
                                    row[columnsDict[label]] = item['labels'][label];
                                }

                            }
                        }
                        for (let annotation of Object.keys(item['annotations'])) {
                            if(annotation in columnsDict) {
                                row[columnsDict[annotation]] = item['annotations'][annotation];
                            }
                        }
                        results.data[0].rows.push(row);
                    }
                }
                return results;
            });
        } else {
            var queryString = this.templateSrv.replace(query.targets[0].expr, options.scopedVars);
            if (queryString) {
                var {queryString, bSilenced} = this.parseQuery(queryString)
                this.silenced = bSilenced === "only" || bSilenced ? true : false;;
            }
            let filter = encodeURIComponent(queryString || "");
            return this.backendSrv.datasourceRequest({
                url: `${this.url}/api/v1/alerts?silenced=${this.silenced}&inhibited=false&filter=${filter}`,
                data: query,
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            }).then(function(response) {
                let data = this.filterSilencedOnlyData(response.data.data, this.silenced)
                return {
                    "data": [{ "datapoints": [ [data.length, Date.now()] ]}]
                }
            }.bind({filterSilencedOnlyData: this.filterSilencedOnlyData, silenced: bSilenced}));
        }
    }

    parseQuery(queryString) {
        const silencedRegex = /=(.*)/;
        let aQueries = queryString.split(",");
        let bSilenced = false;
        aQueries = aQueries.filter(q => {
            if (q.includes("silenced=")) {
                let r = silencedRegex.exec(q);
                if (r != null) {
                    try {
                        bSilenced = JSON.parse(r[1]);
                    }catch(err) {
                        if (r[1] === "only") {
                            bSilenced = "only";
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
        return {queryString, bSilenced};
    }

    filterSilencedOnlyData(data, silenced) {
        if (silenced !== "only") {
            return data;
        }
        return data.filter(d => {
            if (d.status.silencedBy.length === 0) {
                return false;
            }
        });
    }

    getColumns(columnsDict) {
        let columns =  [{ text: "Time", type: "time" }];
        for(let column of Object.keys(columnsDict)) {
            columns.push({ text: column, type: "string" })
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
        let index = 1; // 0 is the data column
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
