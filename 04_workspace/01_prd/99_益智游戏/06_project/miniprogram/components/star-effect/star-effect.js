Component({
  properties: {},
  data: {
    stars: []
  },

  lifetimes: {
    attached() {
      this.generateStars()
    }
  },

  methods: {
    generateStars() {
      const stars = []
      for (let i = 0; i < 12; i++) {
        stars.push({
          id: i,
          left: Math.random() * 100,
          delay: Math.random() * 0.5,
          size: 20 + Math.random() * 40
        })
      }
      this.setData({ stars })
    }
  }
})
