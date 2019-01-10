"use strict";

System.register(["lodash"], function (_export, _context) {
    "use strict";

    var _, _createClass, GenericDatasource;

    function _classCallCheck(instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new TypeError("Cannot call a class as a function");
        }
    }

    return {
        setters: [function (_lodash) {
            _ = _lodash.default;
        }],
        execute: function () {
            _createClass = function () {
                function defineProperties(target, props) {
                    for (var i = 0; i < props.length; i++) {
                        var descriptor = props[i];
                        descriptor.enumerable = descriptor.enumerable || false;
                        descriptor.configurable = true;
                        if ("value" in descriptor) descriptor.writable = true;
                        Object.defineProperty(target, descriptor.key, descriptor);
                    }
                }

                return function (Constructor, protoProps, staticProps) {
                    if (protoProps) defineProperties(Constructor.prototype, protoProps);
                    if (staticProps) defineProperties(Constructor, staticProps);
                    return Constructor;
                };
            }();

            _export("GenericDatasource", GenericDatasource = function () {
                function GenericDatasource(instanceSettings, $q, backendSrv, templateSrv) {
                    _classCallCheck(this, GenericDatasource);

                    this.type = instanceSettings.type;
                    this.url = instanceSettings.url;
                    this.name = instanceSettings.name;
                    this.silenced = typeof instanceSettings.jsonData.silenced !== "undefined" ? instanceSettings.jsonData.silenced : false;
                    this.severityLevels = {};
                    this.severityLevels[instanceSettings.jsonData.severity_critical.toLowerCase()] = 4;
                    this.severityLevels[instanceSettings.jsonData.severity_high.toLowerCase()] = 3;
                    this.severityLevels[instanceSettings.jsonData.severity_warning.toLowerCase()] = 2;
                    this.severityLevels[instanceSettings.jsonData.severity_info.toLowerCase()] = 1;
                    this.q = $q;
                    this.backendSrv = backendSrv;
                    this.templateSrv = templateSrv;

                    this.filters = {
                        "silencedBy": this.silenced,
                        "acknowledgedBy": false
                    };
                }

                _createClass(GenericDatasource, [{
                    key: "query",
                    value: async function query(options) {
                        var _this = this;

                        var query = this.buildQueryParameters(options);
                        query.targets = query.targets.filter(function (t) {
                            return !t.hide;
                        });

                        if (query.targets.length <= 0) {
                            return this.q.when({ data: [] });
                        }
                        var results = {
                            "data": []
                        };
                        var queryPromises = [];

                        query.targets.forEach(function (target) {
                            var queryString = _this.templateSrv.replace(target.expr, options.scopedVars);
                            var filters = Object.assign({}, _this.filters);
                            if (queryString) {
                                for (var filter in filters) {
                                    var _parseAndFilterQuery = _this.parseAndFilterQuery(queryString, filter),
                                        queryString = _parseAndFilterQuery.queryString,
                                        filterValue = _parseAndFilterQuery.filterValue;

                                    filters[filter] = filterValue;
                                };
                            }
                            if (target.type === "table") {
                                // Format data for table panel
                                queryPromises.push(_this.formatDataTable(query, queryString, filters));
                            } else {
                                queryPromises.push(_this.formatDataStat(query, queryString, filters, target.alias));
                            }
                        });
                        var result = await Promise.all(queryPromises);
                        results.data = result;
                        return results;
                    }
                }, {
                    key: "formatDataTable",
                    value: async function formatDataTable(query, queryString, filters) {
                        var labelSelector = this.parseLabelSelector(query.targets[0].labelSelector);
                        var response = await this.makeRequest(query, queryString, filters.silencedBy);
                        var results = {
                            "rows": [],
                            "columns": [],
                            "type": "table"
                        };

                        if (response.data && response.data.data && response.data.data.length) {
                            var data = response.data.data;
                            for (var filter in filters) {
                                data = this.filterOnlyData(data, filter, filters[filter]);
                            };
                            var columnsDict = this.getColumnsDict(data, labelSelector);
                            results.columns = this.getColumns(columnsDict);

                            for (var i = 0; i < data.length; i++) {
                                var row = new Array(results.columns.length).fill("");
                                var item = data[i];

                                var _iteratorNormalCompletion = true;
                                var _didIteratorError = false;
                                var _iteratorError = undefined;

                                try {
                                    for (var _iterator = Object.keys(item['labels']).concat(Object.keys(item)).concat(Object.keys(item['status']))[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                        var label = _step.value;

                                        if (label in columnsDict) {
                                            switch (label) {
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
                                                    var silencedByID = item['status']['silencedBy'][0];
                                                    if (silencedByID) {
                                                        try {
                                                            var silencedBy = await this.getSilencedByUser(silencedByID);
                                                            row[columnsDict[label]] = silencedBy.data.data.createdBy;
                                                        } catch (err) {
                                                            console.error(err);
                                                        }
                                                    }
                                                    break;
                                                default:
                                                    row[columnsDict[label]] = item['labels'][label];
                                            }
                                        }
                                    }
                                } catch (err) {
                                    _didIteratorError = true;
                                    _iteratorError = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion && _iterator.return) {
                                            _iterator.return();
                                        }
                                    } finally {
                                        if (_didIteratorError) {
                                            throw _iteratorError;
                                        }
                                    }
                                }

                                var _iteratorNormalCompletion2 = true;
                                var _didIteratorError2 = false;
                                var _iteratorError2 = undefined;

                                try {
                                    for (var _iterator2 = Object.keys(item['annotations'])[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                        var annotation = _step2.value;

                                        if (annotation in columnsDict) {
                                            row[columnsDict[annotation]] = item['annotations'][annotation];
                                        }
                                    }
                                } catch (err) {
                                    _didIteratorError2 = true;
                                    _iteratorError2 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                            _iterator2.return();
                                        }
                                    } finally {
                                        if (_didIteratorError2) {
                                            throw _iteratorError2;
                                        }
                                    }
                                }

                                results.rows.push(row);
                            }
                        }
                        return results;
                    }
                }, {
                    key: "formatDataStat",
                    value: function formatDataStat(query, queryString, filters, alias) {
                        var _this2 = this;

                        return this.makeRequest(query, queryString, filters.silencedBy).then(function (response) {
                            var data = response.data.data;
                            for (var filter in filters) {
                                data = _this2.filterOnlyData(data, filter, filters[filter]);
                            };
                            return {
                                "datapoints": [[data.length, Date.now()]], "target": alias
                            };
                        });
                    }
                }, {
                    key: "makeRequest",
                    value: function makeRequest(query, queryString, silenced) {
                        var bSilenced = silenced === "only" || silenced ? true : false;
                        var filter = encodeURIComponent(queryString || "");
                        return this.backendSrv.datasourceRequest({
                            url: this.url + "/api/v1/alerts?silenced=" + bSilenced + "&inhibited=false&filter=" + filter,
                            data: query,
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }, {
                    key: "getSilencedByUser",
                    value: function getSilencedByUser(id) {
                        return this.backendSrv.datasourceRequest({
                            url: this.url + "/api/v1/silence/" + id,
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }, {
                    key: "parseAndFilterQuery",
                    value: function parseAndFilterQuery(queryString, filter) {
                        var valueRegex = /=(.*)/;
                        var aQueries = queryString.split(",");
                        var filterValue = false;
                        aQueries = aQueries.filter(function (q) {
                            if (q.includes(filter + "=")) {
                                var r = valueRegex.exec(q);
                                if (r != null) {
                                    var value = void 0;
                                    try {
                                        filterValue = JSON.parse(r[1]);
                                    } catch (err) {
                                        if (r[1] === "only") {
                                            filterValue = "only";
                                        } else {
                                            console.error("error casting silenced value", err);
                                        }
                                    }
                                }
                                return false;
                            } else {
                                return true;
                            }
                        });

                        queryString = aQueries.join(",");
                        queryString = queryString.replace(/\s/g, "");
                        return { "queryString": queryString, "filterValue": filterValue };
                    }
                }, {
                    key: "filterOnlyData",
                    value: function filterOnlyData(data, filter, value) {
                        if (!value || value !== "only") {
                            return data;
                        }

                        return data.filter(function (d) {
                            if (d.status[filter] && d.status[filter].length > 0) {
                                return true;
                            }
                            if (d.labels[filter] && d.labels[filter].length > 0) {
                                return true;
                            }
                            return false;
                        });
                    }
                }, {
                    key: "getColumns",
                    value: function getColumns(columnsDict) {
                        var columns = [];
                        var _iteratorNormalCompletion3 = true;
                        var _didIteratorError3 = false;
                        var _iteratorError3 = undefined;

                        try {
                            for (var _iterator3 = Object.keys(columnsDict)[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                var column = _step3.value;

                                switch (column) {
                                    case "startsAt":
                                        columns.push({ text: column, type: "time" });
                                        break;
                                    default:
                                        columns.push({ text: column, type: "string" });
                                }
                            }
                        } catch (err) {
                            _didIteratorError3 = true;
                            _iteratorError3 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                    _iterator3.return();
                                }
                            } finally {
                                if (_didIteratorError3) {
                                    throw _iteratorError3;
                                }
                            }
                        }

                        return columns;
                    }
                }, {
                    key: "parseLabelSelector",
                    value: function parseLabelSelector(input) {
                        var map;
                        if (typeof input === "undefined" || input.trim().length === 0) {
                            map = ["*"];
                        } else {
                            map = input.trim().split(/\s*,\s*/);
                        }
                        return map;
                    }
                }, {
                    key: "getColumnsDict",
                    value: function getColumnsDict(data, labelSelector) {
                        var index = 0;
                        var columnsDict = {};
                        for (var i = 0; i < data.length; i++) {
                            for (var labelIndex = 0; labelIndex < labelSelector.length; labelIndex++) {
                                var selectedLabel = labelSelector[labelIndex];
                                if (selectedLabel === "*") {
                                    var _iteratorNormalCompletion4 = true;
                                    var _didIteratorError4 = false;
                                    var _iteratorError4 = undefined;

                                    try {
                                        // '*' maps to all labels/annotations not already added via the label selector list
                                        for (var _iterator4 = Object.keys(data[i]['labels'])[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                                            var label = _step4.value;

                                            if (!(label in columnsDict) && label !== 'severity') {
                                                columnsDict[label] = index++;
                                            }
                                        }
                                    } catch (err) {
                                        _didIteratorError4 = true;
                                        _iteratorError4 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion4 && _iterator4.return) {
                                                _iterator4.return();
                                            }
                                        } finally {
                                            if (_didIteratorError4) {
                                                throw _iteratorError4;
                                            }
                                        }
                                    }

                                    var _iteratorNormalCompletion5 = true;
                                    var _didIteratorError5 = false;
                                    var _iteratorError5 = undefined;

                                    try {
                                        for (var _iterator5 = Object.keys(data[i]['annotations'])[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                                            var annotation = _step5.value;

                                            if (!(annotation in columnsDict)) {
                                                columnsDict[annotation] = index++;
                                            }
                                        }
                                    } catch (err) {
                                        _didIteratorError5 = true;
                                        _iteratorError5 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion5 && _iterator5.return) {
                                                _iterator5.return();
                                            }
                                        } finally {
                                            if (_didIteratorError5) {
                                                throw _iteratorError5;
                                            }
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
                }, {
                    key: "testDatasource",
                    value: function testDatasource() {
                        return this.backendSrv.datasourceRequest({
                            url: this.url + '/api/v1/status',
                            method: 'GET'
                        }).then(function (response) {
                            if (response.status === 200) {
                                return { status: "success", message: "Data source is working", title: "Success" };
                            }
                        });
                    }
                }, {
                    key: "buildQueryParameters",
                    value: function buildQueryParameters(options) {
                        var _this3 = this;

                        //remove placeholder targets
                        options.targets = _.filter(options.targets, function (target) {
                            return target.target !== 'select metric';
                        });
                        options.targetss = _.map(options.targets, function (target) {
                            return {
                                target: _this3.templateSrv.replace(target.target),
                                expr: target.expr,
                                refId: target.refId,
                                hide: target.hide,
                                type: target.type || 'single',
                                legendFormat: target.legendFormat || ""
                            };
                        });
                        return options;
                    }
                }, {
                    key: "formatInstanceText",
                    value: function formatInstanceText(labels, legendFormat) {
                        if (legendFormat === "") {
                            return JSON.stringify(labels);
                        }
                        var aliasRegex = /\{\{\s*(.+?)\s*\}\}/g;
                        return legendFormat.replace(aliasRegex, function (match, g1) {
                            if (labels[g1]) {
                                return labels[g1];
                            }
                            return "";
                        });
                    }
                }]);

                return GenericDatasource;
            }());

            _export("GenericDatasource", GenericDatasource);
        }
    };
});
//# sourceMappingURL=datasource.js.map
