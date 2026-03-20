polarity.export = PolarityComponent.extend({
  details: Ember.computed.alias('block.data.details'),

  // ── Computed: action button labels based on incident presence ──────────────
  takedownLabel: Ember.computed('details.hasIncident', function () {
    return this.get('details.hasIncident') ? 'Request Takedown' : 'Submit for Takedown';
  }),

  monitorLabel: Ember.computed('details.hasIncident', function () {
    return this.get('details.hasIncident') ? 'Escalate to Monitoring' : 'Submit for Monitoring';
  }),

  // ── Computed: guard helpers ─────────────────────────────────────────────────
  hasHistory: Ember.computed('details.history', function () {
    const h = this.get('details.history');
    return h && h.length > 0;
  }),

  hasTaxonomy: Ember.computed('details.taxonomyName', function () {
    const n = this.get('details.taxonomyName');
    return n && n !== 'N/A';
  }),

  hasRegistrarName: Ember.computed('details.registrarName', function () {
    return !!this.get('details.registrarName');
  }),

  hasSafeDomain: Ember.computed('details.safeDomain', function () {
    return !!this.get('details.safeDomain');
  }),

  hasReportedBy: Ember.computed('details.reportedBy', function () {
    return !!this.get('details.reportedBy');
  }),

  // ── init ────────────────────────────────────────────────────────────────────
  init() {
    this._super(...arguments);
    if (!this.get('block._state')) {
      this.set('block._state', {
        showHistory: false,
        // action loading flags
        loadingTakedown: false,
        loadingMonitor: false,
        loadingMarkSafe: false,
        loadingComment: false,
        // confirmation modal flags
        confirmTakedown: false,
        confirmMonitor: false,
        takedownComment: '',
        monitorComment: '',
        confirmMarkSafe: false,
        showCommentModal: false,
        // inline error/success messages per action
        takedownMsg: null,
        monitorMsg: null,
        markSafeMsg: null,
        commentMsg: null,
        commentSuccess: null,
        // comment textarea value
        commentText: ''
      });
    }
  },

  // ── Shared post-action handler ──────────────────────────────────────────────
  _handleActionResponse(msgKey, response) {
    if (response && response.updatedData) {
      // Merge updated details back into block data
      this.set('block.data.details', response.updatedData.details);
      this.set('block.data.summary', response.updatedData.summary);
      this.get('block').notifyPropertyChange('data');
    }
    this.set(`block._state.${msgKey}`, null);
  },

  actions: {
    // ── Collapsible sections ─────────────────────────────────────────────────
    toggleSection(section) {
      const key = `block._state.show${section}`;
      this.set(key, !this.get(key));
    },

    // ── Confirmation modal triggers ──────────────────────────────────────────
    openConfirmTakedown() {
      this.set('block._state.confirmTakedown', true);
    },
    cancelTakedown() {
      this.set('block._state.confirmTakedown', false);
      this.set('block._state.takedownComment', '');
    },

    openConfirmMonitor() {
      this.set('block._state.confirmMonitor', true);
    },
    cancelMonitor() {
      this.set('block._state.confirmMonitor', false);
      this.set('block._state.monitorComment', '');
    },

    openConfirmMarkSafe() {
      this.set('block._state.confirmMarkSafe', true);
    },
    cancelMarkSafe() {
      this.set('block._state.confirmMarkSafe', false);
    },

    openCommentModal() {
      this.set('block._state.commentText', '');
      this.set('block._state.commentMsg', null);
      this.set('block._state.showCommentModal', true);
    },
    closeCommentModal() {
      this.set('block._state.showCommentModal', false);
    },

    // ── Action: Submit Takedown ───────────────────────────────────────────────
    confirmTakedown() {
      this.set('block._state.confirmTakedown', false);
      this.set('block._state.loadingTakedown', true);
      this.set('block._state.takedownMsg', null);

      const payload = {
        action: 'SUBMIT_TAKEDOWN',
        entityValue: this.get('details.entityValue'),
        incidentId: this.get('details.incidentId'),
        incidentType: this.get('details.incidentType'),
        comment: (this.get('block._state.takedownComment') || '').trim()
      };
      this.set('block._state.takedownComment', '');

      this.sendIntegrationMessage(payload)
        .then((response) => {
          this._handleActionResponse('takedownMsg', response);
        })
        .catch((err) => {
          this.set('block._state.takedownMsg', (err && err.detail) || 'Takedown request failed.');
        })
        .finally(() => {
          this.set('block._state.loadingTakedown', false);
        });
    },

    // ── Action: Submit Monitor ────────────────────────────────────────────────
    confirmMonitor() {
      this.set('block._state.confirmMonitor', false);
      this.set('block._state.loadingMonitor', true);
      this.set('block._state.monitorMsg', null);

      const payload = {
        action: 'SUBMIT_MONITOR',
        entityValue: this.get('details.entityValue'),
        incidentId: this.get('details.incidentId'),
        incidentType: this.get('details.incidentType'),
        comment: (this.get('block._state.monitorComment') || '').trim()
      };
      this.set('block._state.monitorComment', '');

      this.sendIntegrationMessage(payload)
        .then((response) => {
          this._handleActionResponse('monitorMsg', response);
        })
        .catch((err) => {
          this.set('block._state.monitorMsg', (err && err.detail) || 'Monitor request failed.');
        })
        .finally(() => {
          this.set('block._state.loadingMonitor', false);
        });
    },

    // ── Action: Mark Safe ─────────────────────────────────────────────────────
    confirmMarkSafe() {
      this.set('block._state.confirmMarkSafe', false);
      this.set('block._state.loadingMarkSafe', true);
      this.set('block._state.markSafeMsg', null);

      const payload = {
        action: 'MARK_SAFE',
        entityValue: this.get('details.entityValue'),
        incidentId: this.get('details.incidentId'),
        incidentType: this.get('details.incidentType')
      };

      this.sendIntegrationMessage(payload)
        .then((response) => {
          this._handleActionResponse('markSafeMsg', response);
        })
        .catch((err) => {
          this.set('block._state.markSafeMsg', (err && err.detail) || 'Mark safe request failed.');
        })
        .finally(() => {
          this.set('block._state.loadingMarkSafe', false);
        });
    },

    // ── Action: Add Comment ───────────────────────────────────────────────────
    submitComment() {
      const text = (this.get('block._state.commentText') || '').trim();
      if (!text) {
        this.set('block._state.commentMsg', 'Comment cannot be empty.');
        return;
      }

      this.set('block._state.loadingComment', true);
      this.set('block._state.commentMsg', null);
      this.set('block._state.commentSuccess', null);

      const payload = {
        action: 'ADD_COMMENT',
        entityValue: this.get('details.entityValue'),
        incidentId: this.get('details.incidentId'),
        incidentType: this.get('details.incidentType'),
        comment: text
      };

      this.sendIntegrationMessage(payload)
        .then((response) => {
          this.set('block._state.showCommentModal', false);
          this.set('block._state.commentText', '');
          this._handleActionResponse('commentMsg', response);
        })
        .catch((err) => {
          this.set('block._state.commentMsg', (err && err.detail) || 'Failed to add comment.');
        })
        .finally(() => {
          this.set('block._state.loadingComment', false);
        });
    },

    updateComment(value) {
      this.set('block._state.commentText', value);
    },

    updateTakedownComment(value) {
      this.set('block._state.takedownComment', value);
    },

    updateMonitorComment(value) {
      this.set('block._state.monitorComment', value);
    }
  }
});
