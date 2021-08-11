/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 *   Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License").
 *   You may not use this file except in compliance with the License.
 *   A copy of the License is located at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 *   or in the "license" file accompanying this file. This file is distributed
 *   on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *   express or implied. See the License for the specific language governing
 *   permissions and limitations under the License.
 */

import _ from 'lodash';
import moment from 'moment-timezone';
import { BUCKET_COUNT, FORMIK_INITIAL_VALUES } from './constants';
import { SEARCH_TYPE } from '../../../../../utils/constants';
import { OPERATORS_QUERY_MAP } from './whereFilters';

export function formikToMonitor(values) {
  const uiSchedule = formikToUiSchedule(values);
  const schedule = buildSchedule(values.frequency, uiSchedule);
  const uiSearch = formikToUiSearch(values);
  return {
    name: values.name,
    type: 'monitor',
    monitor_type: values.monitor_type,
    enabled: !values.disabled,
    schedule,
    inputs: [formikToInputs(values)],
    triggers: [],
    ui_metadata: {
      schedule: uiSchedule,
      search: uiSearch,
      monitor_type: values.monitor_type,
    },
  };
}

export function formikToInputs(values) {
  switch (values.searchType) {
    default:
      return formikToSearch(values);
  }
}

export function formikToSearch(values) {
  const isAD = values.searchType === SEARCH_TYPE.AD;
  let query = isAD ? formikToAdQuery(values) : formikToQuery(values);
  const indices = isAD ? ['.opendistro-anomaly-results*'] : formikToIndices(values);

  return {
    search: {
      indices,
      query,
    },
  };
}

export function formikToAdQuery(values) {
  return {
    size: 1,
    sort: [{ anomaly_grade: 'desc' }, { confidence: 'desc' }],
    query: {
      bool: {
        filter: [
          {
            range: {
              execution_end_time: {
                from: '{{period_end}}||-' + values.period.interval + 'm',
                to: '{{period_end}}',
                include_lower: true,
                include_upper: true,
              },
            },
          },
          {
            term: {
              detector_id: {
                value: values.detectorId,
              },
            },
          },
        ],
      },
    },
    aggregations: {
      max_anomaly_grade: {
        max: {
          field: 'anomaly_grade',
        },
      },
    },
  };
}

export function formikToAd(values) {
  return {
    anomaly_detector: {
      detector_id: values.detectorId,
    },
  };
}

export function formikToUiSearch(values) {
  const {
    searchType,
    aggregationType,
    timeField,
    fieldName: [{ label: fieldName = '' } = {}],
    aggregations,
    groupBy,
    overDocuments,
    groupedOverTop,
    groupedOverFieldName,
    bucketValue,
    bucketUnitOfTime,
    where,
  } = values;
  return {
    searchType,
    aggregationType,
    timeField,
    fieldName,
    aggregations,
    groupBy,
    overDocuments,
    groupedOverTop,
    groupedOverFieldName,
    bucketValue,
    bucketUnitOfTime,
    where,
  };
}

export function formikToIndices(values) {
  return values.index.map(({ label }) => label);
}

export function formikToQuery(values) {
  const isGraph = values.searchType === SEARCH_TYPE.GRAPH;
  return isGraph ? formikToGraphQuery(values) : formikToExtractionQuery(values);
}

export function formikToExtractionQuery(values) {
  let query = _.get(values, 'query', FORMIK_INITIAL_VALUES.query);
  try {
    // JSON.parse() throws an exception when the argument is a malformed JSON string.
    // This caused exceptions when tinkering with the JSON in the code editor.
    // This try/catch block will only parse the JSON string if it is not malformed.
    // It will otherwise store the JSON as a string for continued editing.
    query = JSON.parse(query);
  } catch (err) {}
  return query;
}

export function formikToGraphQuery(values) {
  const { bucketValue, bucketUnitOfTime } = values;
  const hasGroupBy = values.groupBy.length;
  const aggregation = hasGroupBy
    ? formikToCompositeAggregation(values)
    : formikToAggregation(values);
  const timeField = values.timeField;
  const filters = [
    {
      range: {
        [timeField]: {
          gte: `{{period_end}}||-${Math.round(bucketValue)}${bucketUnitOfTime}`,
          lte: '{{period_end}}',
          format: 'epoch_millis',
        },
      },
    },
  ];
  const whereClause = formikToWhereClause(values);
  if (whereClause) {
    filters.push({ ...whereClause });
  }
  return {
    size: 0,
    aggregations: aggregation,
    query: {
      bool: {
        filter: filters,
      },
    },
  };
}

export function formikToUiGraphQuery(values) {
  const { bucketValue, bucketUnitOfTime } = values;
  const overAggregation = formikToUiOverAggregation(values);
  const timeField = values.timeField;
  const filters = [
    {
      range: {
        [timeField]: {
          // default range window to [BUCKET_COUNT] * the date histogram interval
          gte: `now-${bucketValue * BUCKET_COUNT}${bucketUnitOfTime}`,
          lte: 'now',
        },
      },
    },
  ];
  const whereClause = formikToWhereClause(values);
  if (whereClause) {
    filters.push({ ...whereClause });
  }
  return {
    size: 0,
    aggregations: overAggregation,
    query: {
      bool: {
        filter: filters,
      },
    },
  };
}

export function formikToUiOverAggregation(values) {
  const whenAggregation = formikToWhenAggregation(values);
  const { bucketValue, bucketUnitOfTime } = values;
  const timeField = values.timeField;

  return {
    over: {
      date_histogram: {
        field: timeField,
        interval: `${bucketValue}${bucketUnitOfTime}`,
        time_zone: moment.tz.guess(),
        min_doc_count: 0,
        extended_bounds: {
          min: `now-${bucketValue * BUCKET_COUNT}${bucketUnitOfTime}`,
          max: 'now',
        },
      },
      aggregations: whenAggregation,
    },
  };
}

export function formikToWhereClause({ where }) {
  if (where.fieldName.length > 0) {
    return OPERATORS_QUERY_MAP[where.operator].query(where);
  }
}

export function formikToWhenAggregation(values) {
  const {
    aggregationType,
    fieldName: [{ label: field } = {}],
  } = values;
  if (aggregationType === 'count' || !field) return {};
  return { when: { [aggregationType]: { field } } };
}

export function formikToCompositeAggregation(values) {
  const { aggregations, groupBy } = values;

  let aggs = {};
  aggregations.map((aggItem) => {
    // TODO: Changing any occurrence of '.' in the fieldName to '_' since the
    //  bucketSelector uses the '.' syntax to resolve aggregation paths.
    //  Should revisit this as replacing with `_` could cause collisions with fields named like that.
    const name = `${aggItem.aggregationType}_${aggItem.fieldName.replace(/\./g, '_')}`;
    const type = aggItem.aggregationType === 'count' ? 'value_count' : aggItem.aggregationType;
    aggs[name] = {
      [type]: { field: aggItem.fieldName },
    };
  });
  let sources = [];
  groupBy.map((groupByItem) =>
    sources.push({
      [groupByItem]: {
        terms: {
          field: groupByItem,
        },
      },
    })
  );
  return {
    composite_agg: {
      composite: { sources },
      aggs,
    },
  };
}

export function formikToAggregation(values) {
  const { aggregations } = values;

  let aggs = {};
  aggregations.map((aggItem) => {
    const name = `${aggItem.aggregationType}_${aggItem.fieldName}`;
    const type = aggItem.aggregationType === 'count' ? 'value_count' : aggItem.aggregationType;
    aggs[name] = {
      [type]: { field: aggItem.fieldName },
    };
  });
  return aggs;
}

export function formikToUiSchedule(values) {
  return {
    timezone: _.get(values, 'timezone[0].label', null),
    frequency: values.frequency,
    period: values.period,
    daily: values.daily,
    weekly: values.weekly,
    monthly: values.monthly,
    cronExpression: values.cronExpression,
  };
}

export function buildSchedule(scheduleType, values) {
  const {
    period,
    daily,
    weekly,
    monthly: { type, day },
    cronExpression,
    timezone,
  } = values;
  switch (scheduleType) {
    case 'interval': {
      return { period };
    }
    case 'daily': {
      return { cron: { expression: `0 ${daily} * * *`, timezone } };
    }
    case 'weekly': {
      const daysOfWeek = Object.entries(weekly)
        .filter(([day, checked]) => checked)
        .map(([day]) => day.toUpperCase())
        .join(',');
      return { cron: { expression: `0 ${daily} * * ${daysOfWeek}`, timezone } };
    }
    case 'monthly': {
      let dayOfMonth = '?';
      if (type === 'day') {
        dayOfMonth = day;
      }
      return { cron: { expression: `0 ${daily} ${dayOfMonth} */1 *`, timezone } };
    }
    case 'cronExpression':
      return { cron: { expression: cronExpression, timezone } };
  }
}
