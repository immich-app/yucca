import { TaskType } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { RunningTasksRepository } from './runningTasks.repository';

const newGatewayMock = (): jest.Mocked<Pick<EventsGateway, 'publish'>> => ({
  publish: jest.fn(),
});

describe(RunningTasksRepository.name, () => {
  let gateway: jest.Mocked<Pick<EventsGateway, 'publish'>>;
  let sut: RunningTasksRepository;

  beforeEach(() => {
    gateway = newGatewayMock();
    sut = new RunningTasksRepository(gateway as never);
  });

  describe('canStart', () => {
    it('returns true when no task is running', () => {
      expect(sut.canStart('repo-1')).toBe(true);
    });

    it('returns false when a task is already running', () => {
      sut.startTask('repo-1', TaskType.Backup);
      expect(sut.canStart('repo-1')).toBe(false);
    });

    it('returns true for a different parent', () => {
      sut.startTask('repo-1', TaskType.Backup);
      expect(sut.canStart('repo-2')).toBe(true);
    });

    it('returns true after task ends', () => {
      sut.startTask('repo-1', TaskType.Backup);
      sut.endTask('repo-1');
      expect(sut.canStart('repo-1')).toBe(true);
    });
  });

  describe('startTask', () => {
    it('publishes TaskStart event', () => {
      sut.startTask('repo-1', TaskType.Backup, 'log-1');

      expect(gateway.publish).toHaveBeenCalledWith({
        type: 'TaskStart',
        task: {
          parentId: 'repo-1',
          type: TaskType.Backup,
          logId: 'log-1',
        },
      });
    });

    it('publishes TaskStart without logId', () => {
      sut.startTask('repo-1', TaskType.Forget);

      expect(gateway.publish).toHaveBeenCalledWith({
        type: 'TaskStart',
        task: {
          parentId: 'repo-1',
          type: TaskType.Forget,
          logId: undefined,
        },
      });
    });
  });

  describe('updateTask', () => {
    it('publishes TaskUpdate event', () => {
      sut.startTask('repo-1', TaskType.Schedule);
      gateway.publish.mockClear();

      sut.updateTask('repo-1', { scheduleStatus: [] });

      expect(gateway.publish).toHaveBeenCalledWith({
        type: 'TaskUpdate',
        parentId: 'repo-1',
        task: { scheduleStatus: [] },
      });
    });

    it('throws when task does not exist', () => {
      expect(() => sut.updateTask('nonexistent', {})).toThrow('Task for parent nonexistent does not exist.');
    });
  });

  describe('endTask', () => {
    it('publishes TaskEnd event and removes task', () => {
      sut.startTask('repo-1', TaskType.Backup);
      gateway.publish.mockClear();

      sut.endTask('repo-1');

      expect(gateway.publish).toHaveBeenCalledWith({
        type: 'TaskEnd',
        parentId: 'repo-1',
      });
      expect(sut.canStart('repo-1')).toBe(true);
    });
  });
});
