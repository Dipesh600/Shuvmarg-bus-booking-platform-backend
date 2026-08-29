'use strict';

const logger = require('../../../../utils/logger');

const createService = ({ errors, mapper, parse, repository }) => {
  const read = async (operation) => {
    try { return await operation(); } catch (error) {
      if (error.name === 'ValidationError') throw errors.invalidInput(
        Object.values(error.errors || {}).map((item) => item.message),
      );
      throw error;
    }
  };

  const scope = async (userId, query) => {
    const parsed = parse.parsePage(query);
    if (parsed.errors.length) throw errors.invalidInput(parsed.errors);
    const agent = await read(() => repository.findAgentForUser(userId));
    if (!agent) throw errors.noApplication();
    return { agentId: agent._id, ...parsed.value };
  };

  const listSales = async (userId, query) => {
    const paging = await scope(userId, query);
    return {
      statusCode: 200,
      responseBody: mapper.toSalesResponse({
        ...await read(() => repository.listSales(paging)), ...paging,
      }),
    };
  };

  const listCustomers = async (userId, query) => {
    const paging = await scope(userId, query);
    const result = await read(() => repository.listCustomers(paging));
    if (result.truncatedSales > 0) logger.warn('Agent customer roll-up truncated', {
      agentId: String(paging.agentId), droppedSales: result.truncatedSales,
    });
    return {
      statusCode: 200,
      responseBody: mapper.toCustomersResponse({ ...result, ...paging }),
    };
  };

  return { listCustomers, listSales };
};

module.exports = { createService };
